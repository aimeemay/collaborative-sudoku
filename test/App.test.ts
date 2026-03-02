/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import { addSharedItem, waitForStarterApp } from "./test-utils";

test.describe("Smoke Tests", () => {
	test.beforeEach(async ({ page }) => {
		await waitForStarterApp(page);
	});

	test("should load the starter checklist UI", async ({ page }) => {
		await expect(page.getByPlaceholder("Shared list title")).toHaveValue(/.+/);
		await expect(page.getByRole("button", { name: "Smart fill" })).toBeVisible();
		await expect(page.getByText(/\d+ online/i)).toBeVisible();
		await expect(
			page.getByText("No shared items yet. Add one above or ask AI to draft a list.")
		).toBeVisible();
	});

	test("should add and check off an item", async ({ page }) => {
		await addSharedItem(page, "Write regression tests");
		await expect(page.getByText("Write regression tests")).toBeVisible();

		const firstCheckbox = page.getByRole("checkbox").first();
		await firstCheckbox.check();
		await expect(firstCheckbox).toBeChecked();
		await expect(page.getByText(/1\/1 done · 0 left/i)).toBeVisible();
	});
});
