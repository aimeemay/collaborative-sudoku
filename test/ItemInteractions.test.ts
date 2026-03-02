/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { test, expect } from "@playwright/test";
import { addSharedItem, waitForStarterApp } from "./test-utils";

test.describe("Item Interactions", () => {
	test.beforeEach(async ({ page }) => {
		await waitForStarterApp(page);
	});

	test("should update the shared title", async ({ page }) => {
		const titleInput = page.getByPlaceholder("Shared list title");
		await titleInput.fill("Q2 Launch Checklist");
		await expect(titleInput).toHaveValue("Q2 Launch Checklist");
	});

	test("should add item using Enter key", async ({ page }) => {
		const input = page.getByPlaceholder("Add a shared item");
		await input.fill("Prepare demo script");
		await input.press("Enter");

		await expect(page.getByText("Prepare demo script")).toBeVisible();
		await expect(input).toHaveValue("");
	});

	test("should uncheck a completed item", async ({ page }) => {
		await addSharedItem(page, "Finalize release notes");

		const checkbox = page.getByRole("checkbox").first();
		await checkbox.check();
		await expect(page.getByText(/1\/1 done · 0 left/i)).toBeVisible();

		await checkbox.uncheck();
		await expect(checkbox).not.toBeChecked();
		await expect(page.getByText(/0\/1 done · 1 left/i)).toBeVisible();
	});

	test("should show item author metadata", async ({ page }) => {
		await addSharedItem(page, "Create release blog post");
		await expect(page.getByText(/^by\s+/i)).toBeVisible();
	});

	test("should keep only one empty-state message", async ({ page }) => {
		await expect(page.getByText("No shared items yet. Add one above or ask AI to draft a list.")).toHaveCount(1);
	});

	test("should hide empty-state once items are added", async ({ page }) => {
		await addSharedItem(page, "Draft migration guide");
		await expect(page.getByText("No shared items yet. Add one above or ask AI to draft a list.")).toHaveCount(0);
	});

	test("should preserve item order in UI", async ({ page }) => {
		await addSharedItem(page, "First item");
		await addSharedItem(page, "Second item");
		await addSharedItem(page, "Third item");

		const labels = page.locator("section span.text-white, section span.text-slate-400.line-through");
		await expect(labels.nth(0)).toHaveText("First item");
		await expect(labels.nth(1)).toHaveText("Second item");
		await expect(labels.nth(2)).toHaveText("Third item");
	});
});
