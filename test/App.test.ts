/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import { openSameSessionInNewPage, waitForStarterApp } from "./test-utils";

test.describe("Smoke Tests", () => {
	test.beforeEach(async ({ page }) => {
		await waitForStarterApp(page);
	});

	test("should load the collaborative Sudoku UI", async ({ page }) => {
		await expect(page.getByRole("heading", { name: "Collaborative Sudoku" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Scoreboard" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Submit move" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Pass" })).toBeVisible();
	});

	test("should show your turn indicator", async ({ page }) => {
		await expect(page.getByText("Your turn")).toBeVisible();
	});

	test("should submit one validated move", async ({ page }) => {
		await page.locator("[data-fixed='false']").first().click();
		await page.keyboard.press("1");
		await page.getByRole("button", { name: "Submit move" }).click();
		await expect(
			page.getByText(/cannot be changed|accepted|Wrong|passed/i)
		).toBeVisible();
	});

	test("can pass turn", async ({ page }) => {
		await page.getByRole("button", { name: "Pass" }).click();
		await expect(page.getByText(/passed/i)).toBeVisible();
	});

	test("admin can kick joined player", async ({ page, context }) => {
		const secondPage = await context.newPage();
		await openSameSessionInNewPage(page, secondPage);

		// Wait for second player to appear and be kicked
		await page.waitForTimeout(1500);
		const kickButtons = page.getByRole("button", { name: /×/ });
		if ((await kickButtons.count()) > 0) {
			await kickButtons.first().click();
		}

		// After being kicked, the Rejoin button should appear on second page
		await expect(secondPage.getByRole("button", { name: "Rejoin" })).toBeVisible({
			timeout: 5000,
		});

		await secondPage.close();
	});
});
