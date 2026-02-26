# 冗長・不要コード検出レポート

## 0. 削除済み (Removed)
- `lib/utils/debug.ts`: デバッグ用ユーティリティ。参照なしのため削除。
- `update_UI/lib/config/feature-flags.ts`: 参照なしのため削除。
- `update_UI/lib/server/pdf-tokenizer.ts`: 参照なしのため削除。
- `update_UI/lib/stripe/actions.ts`: 参照なしのため削除。
- `update_UI/report_agent_asgi.py`: 参照なしのため削除。
- `update_UI/report_backend/core/logging.py`: 参照なしのため削除。
- `update_UI/report_backend/workspaces/extract-ui-state.js`: 参照なしのため削除。
- `update_UI/scripts/test-webhook.ts`: 参照なしのため削除。

## 1. 未使用のファイル (Unused Files)
- `lib/constants.ts`: プロダクションコードから参照が見当たらず、定義書内の記述のみ。
- `update_UI/components/theme-provider.tsx`: `ThemeProvider` の参照が見当たらない。
- `update_UI/components/ui/accordion.tsx`: `@/components/ui/accordion` の参照が見当たらない。
- `update_UI/components/ui/alert.tsx`: `@/components/ui/alert` の参照が見当たらない。
- `update_UI/components/ui/aspect-ratio.tsx`: `@/components/ui/aspect-ratio` の参照が見当たらない。
- `update_UI/components/ui/avatar.tsx`: `@/components/ui/avatar` の参照が見当たらない。
- `update_UI/components/ui/breadcrumb.tsx`: `@/components/ui/breadcrumb` の参照が見当たらない。
- `update_UI/components/ui/button-group.tsx`: `@/components/ui/button-group` の参照が見当たらない。
- `update_UI/components/ui/calendar.tsx`: `@/components/ui/calendar` の参照が見当たらない。
- `update_UI/components/ui/carousel.tsx`: `@/components/ui/carousel` の参照が見当たらない。
- `update_UI/components/ui/chart.tsx`: `@/components/ui/chart` の参照が見当たらない。
- `update_UI/components/ui/checkbox.tsx`: `@/components/ui/checkbox` の参照が見当たらない。
- `update_UI/components/ui/collapsible.tsx`: `@/components/ui/collapsible` の参照が見当たらない。
- `update_UI/components/ui/command.tsx`: `@/components/ui/command` の参照が見当たらない。
- `update_UI/components/ui/context-menu.tsx`: `@/components/ui/context-menu` の参照が見当たらない。
- `update_UI/components/ui/drawer.tsx`: `@/components/ui/drawer` の参照が見当たらない。
- `update_UI/components/ui/empty.tsx`: `@/components/ui/empty` の参照が見当たらない。
- `update_UI/components/ui/field.tsx`: `@/components/ui/field` の参照が見当たらない。
- `update_UI/components/ui/form.tsx`: `@/components/ui/form` の参照が見当たらない。
- `update_UI/components/ui/hover-card.tsx`: `@/components/ui/hover-card` の参照が見当たらない。
- `update_UI/components/ui/input-group.tsx`: `@/components/ui/input-group` の参照が見当たらない。
- `update_UI/components/ui/input-otp.tsx`: `@/components/ui/input-otp` の参照が見当たらない。
- `update_UI/components/ui/item.tsx`: `@/components/ui/item` の参照が見当たらない。
- `update_UI/components/ui/kbd.tsx`: `@/components/ui/kbd` の参照が見当たらない。
- `update_UI/components/ui/menubar.tsx`: `@/components/ui/menubar` の参照が見当たらない。
- `update_UI/components/ui/navigation-menu.tsx`: `@/components/ui/navigation-menu` の参照が見当たらない。
- `update_UI/components/ui/pagination.tsx`: `@/components/ui/pagination` の参照が見当たらない。
- `update_UI/components/ui/popover.tsx`: `@/components/ui/popover` の参照が見当たらない。
- `update_UI/components/ui/radio-group.tsx`: `@/components/ui/radio-group` の参照が見当たらない。
- `update_UI/components/ui/resizable.tsx`: `@/components/ui/resizable` の参照が見当たらない。
- `update_UI/components/ui/scroll-area.tsx`: `@/components/ui/scroll-area` の参照が見当たらない。
- `update_UI/components/ui/select.tsx`: `@/components/ui/select` の参照が見当たらない。
- `update_UI/components/ui/slider.tsx`: `@/components/ui/slider` の参照が見当たらない。
- `update_UI/components/ui/sonner.tsx`: `@/components/ui/sonner` の参照が見当たらない。
- `update_UI/components/ui/spinner.tsx`: `@/components/ui/spinner` の参照が見当たらない。
- `update_UI/components/ui/table.tsx`: `@/components/ui/table` の参照が見当たらない。
- `update_UI/components/ui/toaster.tsx`: `@/components/ui/toaster` の参照が見当たらない。
- `update_UI/components/ui/toggle-group.tsx`: `@/components/ui/toggle-group` の参照が見当たらない。
- `update_UI/components/ui/use-mobile.tsx`: `@/components/ui/use-mobile` の参照が見当たらない。
- `update_UI/components/ui/use-toast.ts`: `@/components/ui/use-toast` の参照が見当たらない。
- `update_UI/scripts/ui-audit/extract-ui-state.js`: ドキュメント記載はあるが、コード側からの参照は見当たらない（手動実行スクリプト）。
- `update_UI/scripts/ui-audit/extract-ui-text.js`: ドキュメント記載はあるが、コード側からの参照は見当たらない（手動実行スクリプト）。
- `update_UI/styles/globals.css`: 定義書でレガシー扱いと明記、参照が見当たらない。

## 2. 未使用のエクスポート (Unused Exports)
- `update_UI/components/report-processing-steps.tsx`: `type ProcessingStepStatus`（ファイル内のみ参照）。
- `update_UI/components/ui/alert-dialog.tsx`: `AlertDialogOverlay`（外部参照が見当たらない）。
- `update_UI/components/ui/alert-dialog.tsx`: `AlertDialogPortal`（外部参照が見当たらない）。
- `update_UI/components/ui/alert-dialog.tsx`: `AlertDialogTrigger`（外部参照が見当たらない）。
- `update_UI/components/ui/badge.tsx`: `badgeVariants`（外部参照が見当たらない）。
- `update_UI/components/ui/card.tsx`: `CardAction`（外部参照が見当たらない）。
- `update_UI/components/ui/card.tsx`: `CardFooter`（外部参照が見当たらない）。
- `update_UI/components/ui/dialog.tsx`: `DialogClose`（外部参照が見当たらない）。
- `update_UI/components/ui/dialog.tsx`: `DialogFooter`（外部参照が見当たらない）。
- `update_UI/components/ui/dialog.tsx`: `DialogOverlay`（外部参照が見当たらない）。
- `update_UI/components/ui/dialog.tsx`: `DialogPortal`（外部参照が見当たらない）。
- `update_UI/components/ui/dialog.tsx`: `DialogTrigger`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuCheckboxItem`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuGroup`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuLabel`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuPortal`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuRadioGroup`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuRadioItem`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuShortcut`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuSub`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuSubContent`（外部参照が見当たらない）。
- `update_UI/components/ui/dropdown-menu.tsx`: `DropdownMenuSubTrigger`（外部参照が見当たらない）。
- `update_UI/components/ui/sheet.tsx`: `SheetClose`（外部参照が見当たらない）。
- `update_UI/components/ui/sheet.tsx`: `SheetFooter`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarGroup`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarGroupAction`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarGroupContent`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarGroupLabel`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarInput`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarMenuAction`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarMenuBadge`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarMenuSkeleton`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarMenuSub`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarMenuSubButton`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarMenuSubItem`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarRail`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `SidebarSeparator`（外部参照が見当たらない）。
- `update_UI/components/ui/sidebar.tsx`: `useSidebar`（外部参照が見当たらない）。
- `update_UI/components/ui/toast.tsx`: `ToastAction`（外部参照が見当たらない）。
- `update_UI/lib/server/logger.ts`: `logInfo`（外部参照が見当たらない）。
- `update_UI/lib/server/report-agent.ts`: `rowsToCsv`（外部参照が見当たらない。ファイル内でのみ使用）。
- `update_UI/lib/supabase/types.ts`: `Json`（外部参照が見当たらない）。

## 3. 意味不明・プレースホルダーの疑い (Ambiguous Naming)
- `update_UI/report_backend/tests/test_agent_units.py`: 環境変数に `dummy` を使用（テスト専用のため除外対象）。
- `update_UI/report_backend/tests/test_build_graph_mvp.py`: `dummy` を使用（テスト専用のため除外対象）。

## 4. 空ファイル・コメントアウト (Empty/Zombie)
- `update_UI/report_backend/app/__init__.py`: 空ファイル（パッケージ識別用途なら維持）。
- `update_UI/report_backend/app/api/__init__.py`: 空ファイル（パッケージ識別用途なら維持）。
- 大規模にコメントアウトされたコードブロックは簡易検索では検出されず。
