/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, Page } from "@playwright/test";

export async function waitForStarterApp(page: Page): Promise<void> {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.getByPlaceholder("Shared list title")).toBeVisible({ timeout: 15000 });
	await expect(page.getByPlaceholder("Add a shared item")).toBeVisible();
	await expect(page.getByRole("button", { name: "Smart fill" })).toBeVisible();
}

export async function addSharedItem(page: Page, text: string): Promise<void> {
	await page.getByPlaceholder("Add a shared item").fill(text);
	await page.getByRole("button", { name: "Add" }).click();
	await expect(page.getByText(text)).toBeVisible();
}

export async function openSameSessionInNewPage(page: Page, otherPage: Page): Promise<void> {
	await otherPage.goto(page.url(), { waitUntil: "domcontentloaded" });
	await expect(otherPage.getByPlaceholder("Shared list title")).toBeVisible({ timeout: 15000 });
}
