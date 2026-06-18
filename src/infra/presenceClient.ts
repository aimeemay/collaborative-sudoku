import React from "react";
import { IFluidContainer } from "fluid-framework";
import { getPresence } from "@fluidframework/presence/beta";
import { createUsersManager } from "../presence/users.js";
import { createCursorManager } from "../presence/cursor.js";
import { User, UsersManager } from "../presence/Interfaces/UsersManager.js";
import { CursorManager, CursorState } from "../presence/Interfaces/CursorManager.js";

export type PresenceClients = {
	users: UsersManager;
	cursor: CursorManager;
	dispose: () => void;
};

export type PresenceUser = { id: string; name: string; image?: string };

export function createPresenceClients(
	container: IFluidContainer,
	me: PresenceUser
): PresenceClients {
	const presence = getPresence(container);
	const workspace = presence.states.getWorkspace("workspace:starter", {});

	const users = createUsersManager({
		name: "users:starter",
		workspace,
		me,
	});

	const cursor = createCursorManager({
		name: "cursor:starter",
		workspace,
	});

	const dispose = () => {
		// No-op cleanup placeholder; managers expose unsubscribe per listener.
	};

	return { users, cursor, dispose };
}

export function usePresenceUsers(users: UsersManager): readonly User[] {
	const [current, setCurrent] = React.useState<readonly User[]>(users.getConnectedUsers());

	React.useEffect(() => {
		let last = "";
		const update = () => {
			const next = users.getConnectedUsers();
			// Only set state when the connected set actually changes (avoids render churn)
			const key = next.map((u) => u.value.id).sort().join(",");
			if (key !== last) {
				last = key;
				setCurrent(next);
			}
		};
		const offLocal = users.events.on("localUpdated", update);
		const offRemote = users.events.on("remoteUpdated", update);
		// Fire when an attendee joins/disconnects (tab close, network drop, etc.)
		const offDisconnect = users.attendees.events.on("attendeeDisconnected", update);
		// Poll as a safety net — presence status flips can lag behind the event
		const interval = window.setInterval(update, 2000);
		update();
		return () => {
			offLocal();
			offRemote();
			offDisconnect();
			window.clearInterval(interval);
		};
	}, [users]);

	return current;
}

export function useCursorPresence(cursor: CursorManager): CursorState | null {
	const [state, setState] = React.useState<CursorState | null>(cursor.state.local);

	React.useEffect(() => {
		const update = () => setState(cursor.state.local);
		const unsubscribe = cursor.events.on("localUpdated", update);
		return () => unsubscribe();
	}, [cursor]);

	return state;
}

/**
 * Track which cell each remote user is hovering over.
 * Uses cursor.x as cell index (-1 = no cell) and cursor.y as player color index.
 */
export function useCellPresence(
	cursor: CursorManager,
	users: UsersManager
): Map<number, { playerId: string; playerName: string; colorIndex: number }[]> {
	const [cells, setCells] = React.useState<Map<number, { playerId: string; playerName: string; colorIndex: number }[]>>(new Map());

	React.useEffect(() => {
		const update = () => {
			const remoteCursors = cursor.getVisibleRemoteCursors();
			const connectedUsers = users.getConnectedUsers();

			const attendeeToUser = new Map<string, { id: string; name: string }>();
			for (const u of connectedUsers) {
				attendeeToUser.set(u.client.attendeeId, { id: u.value.id, name: u.value.name });
			}

			const map = new Map<number, { playerId: string; playerName: string; colorIndex: number }[]>();
			for (const rc of remoteCursors) {
				const cellIndex = Math.round(rc.state.x);
				const colorIndex = Math.round(rc.state.y);
				if (cellIndex < 0 || cellIndex >= 81) continue;
				const user = attendeeToUser.get(rc.clientId);
				if (!user) continue;
				const entry = { playerId: user.id, playerName: user.name, colorIndex };
				const existing = map.get(cellIndex);
				if (existing) existing.push(entry);
				else map.set(cellIndex, [entry]);
			}
			setCells(map);
		};

		const offRemote = cursor.events.on("remoteUpdated", update);
		const interval = setInterval(update, 2000);
		update();
		return () => {
			offRemote();
			clearInterval(interval);
		};
	}, [cursor, users]);

	return cells;
}
