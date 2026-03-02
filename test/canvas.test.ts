/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import { addSharedItem, waitForStarterApp } from "./test-utils";

test.describe("List Operations", () => {
	test.beforeEach(async ({ page }) => {
		await waitForStarterApp(page);
	});

	test("should add multiple shared items", async ({ page }) => {
		await addSharedItem(page, "Set milestones");
		await addSharedItem(page, "Review pull requests");
		await addSharedItem(page, "Ship release");

		await expect(page.getByRole("checkbox")).toHaveCount(3);
		await expect(page.getByText(/0\/3 done · 3 left/i)).toBeVisible();
	});

	test("should update progress as items are completed", async ({ page }) => {
		await addSharedItem(page, "Task A");
		await addSharedItem(page, "Task B");

		const checkboxes = page.getByRole("checkbox");
		await checkboxes.nth(0).check();
		await expect(page.getByText(/1\/2 done · 1 left/i)).toBeVisible();

		await checkboxes.nth(1).check();
		await expect(page.getByText(/2\/2 done · 0 left/i)).toBeVisible();
	});

	test("should strike through checked items", async ({ page }) => {
		const itemText = "Document API changes";
		await addSharedItem(page, itemText);

		const rowLabel = page.getByText(itemText).first();
		await page.getByRole("checkbox").first().check();
		await expect(rowLabel).toHaveClass(/line-through/);
	});
});
