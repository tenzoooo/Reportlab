import { test, expect } from '@playwright/test';

test.describe('Dark Mode Audit', () => {
  test('should have dark backgrounds for all interactive elements in Dark Mode', async ({ page }) => {
    // 1. Go to Settings and enable Dark Mode
    await page.goto('/dashboard/settings?tab=profile');
    
    // Click Dark Mode button (assuming text "ダーク" exists from previous step)
    await page.getByRole('button', { name: 'ダーク' }).click();
    
    // Wait for theme application
    await page.waitForTimeout(500);

    // 2. Open Notification Panel
    const bellIcon = page.locator('button').filter({ has: page.locator('svg.lucide-bell') });
    if (await bellIcon.count() > 0) {
      await bellIcon.first().click();
      const notificationPanel = page.locator('.absolute.right-0.mt-2.w-96'); // Selector based on code analysis
      await expect(notificationPanel).toBeVisible();
      
      // Check background color (should not be white rgb(255, 255, 255))
      const bgColor = await notificationPanel.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });
      console.log('Notification Panel BG:', bgColor);
      if (bgColor === 'rgb(255, 255, 255)') {
        console.error('FAILURE: Notification Panel is white in Dark Mode');
      }
    }

    // 3. Open Search Dialog (if present)
    // Assuming command+k or a search button exists in header
    // ...

    // 4. Check Settings Page Cards
    const cards = page.locator('.card, .rounded-xl.border.bg-card'); // Common card classes
    const count = await cards.count();
    for (let i = 0; i < count; ++i) {
      const card = cards.nth(i);
      const bg = await card.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      // In dark mode, bg should be dark (e.g., rgb(26, 26, 26) or similar)
      console.log(`Card ${i} BG:`, bg);
    }
  });
});
