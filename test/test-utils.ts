/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, Page } from "@playwright/test";

export async function waitForStarterApp(page: Page): Promise<void> {
	await page.goto("/", { waitUntil: "domcontentloaded" });

	// Backstage: create a room if on lobby
	const createRoomButton = page.getByRole("button", { name: "Create room" });
	if (await createRoomButton.isVisible()) {
		await createRoomButton.click();
	}

	// Name picker: submit default name to join
	const joinButton = page.getByRole("button", { name: /^Join →$/ });
	if (await joinButton.isVisible({ timeout: 8000 }).catch(() => false)) {
		await joinButton.click();
	}

	await expect(page.getByRole("heading", { name: "Co-Sudoku" })).toBeVisible({
		timeout: 15000,
	});
	await expect(page.getByRole("button", { name: "Submit move" })).toBeVisible();
}

export async function addSharedItem(page: Page, _text: string): Promise<void> {
	await page.getByRole("button", { name: "Submit move" }).click();
}

export async function openSameSessionInNewPage(page: Page, otherPage: Page): Promise<void> {
	await otherPage.goto(page.url(), { waitUntil: "domcontentloaded" });

	// Name picker on the second page
	const joinButton = otherPage.getByRole("button", { name: /^Join →$/ });
	if (await joinButton.isVisible({ timeout: 8000 }).catch(() => false)) {
		await joinButton.click();
	}

	await expect(otherPage.getByRole("heading", { name: "Co-Sudoku" })).toBeVisible({
		timeout: 15000,
	});
}
