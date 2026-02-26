import { test, expect } from '@playwright/test';

test.describe('Dashboard Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Assuming we have a way to bypass auth or login
    // For now, we visit the page directly (mocking auth state would be needed in real setup)
    await page.goto('/dashboard/settings');
  });

  test('should display all tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'プロフィール' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'サブスク' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '通知' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'セキュリティ' })).toBeVisible();
  });

  test('should switch to Notifications tab and toggle settings', async ({ page }) => {
    await page.getByRole('tab', { name: '通知' }).click();
    
    const emailSwitch = page.getByLabel('メール通知');
    await expect(emailSwitch).toBeVisible();
    
    // Toggle off
    await emailSwitch.click();
    await expect(page.getByText('通知設定を保存しました')).toBeVisible(); // Toast check
  });

  test('should open Delete Account dialog in Security tab', async ({ page }) => {
    await page.getByRole('tab', { name: 'セキュリティ' }).click();
    
    const deleteBtn = page.getByRole('button', { name: 'アカウントを削除' });
    await expect(deleteBtn).toBeVisible();
    
    await deleteBtn.click();
    
    // Check dialog
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText('本当にアカウントを削除しますか？')).toBeVisible();
    
    // Cancel
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
  });
});
