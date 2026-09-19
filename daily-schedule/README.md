# 每日班表發布

這個獨立分支只維護 `magicoffice-data` 的班表備援。主站不由此分支部署。

現有每天 09:00 的巡檢先讀原始試算表 metadata 與完整原始格，使用現行解析器核對後，更新本分支 `daily-schedule/request.json`。每次真實核對都更新 `sourceVerifiedAt`，即使內容相同也觸發新備援發布。

GitHub Actions 從當前正式資料部署恢復完整來源，直接讀原表原生 CSV，再次核对資料雜湊，跑測試，只更新 `fallback.json`，建立新的 Production 資料部署。只有 READY、正式 alias、已部署備援內容，以及資料服務／主站的逐列核對全部通過，才能稱為發布成功。碧瑠必須保留。

## 一次性必要設定

在此 repository 的 Settings → Secrets and variables → Actions 中設定 `VERCEL_TOKEN`，使用有權操作 MagicOffice 所屬 Vercel team 的部署 Token。只透過安全設定輸入，勿放進對話、程式或 commit。Token 不存在時，流程會明確失敗，不更動線上網站。

## 發布请求欄位

- `projectId`：只允許獨立資料專案。
- `expectedDeploymentId`：本次核對的現行正式資料部署，防止覆蓋其他人的新改版。
- `sourceVerifiedAt`：本次原始格核對時間，要求一小時內。
- `sourceHash`／`publicHash`：完整原表解析集合／依現行人員規則過濾後的集合雜湊。
- `publishedMonths`：metadata 已確認公布的月份，例如 `2026-09`。若服務設定未納入新月份，流程會停止並要求處理，不默默漏掉。
- `excludedNames`：依最新使用者指示維護；碧瑠不得排除。

原始表 ID、gid、config.json、原始格與內部備註不寫入此分支或公開 artifact。伺服器來源在暫存目錄使用後清除；artifact 僅保存結果摘要與雜湊。若正式服務檔案結構變更，先檢閱允許檔案清單再繼續。

本流程不另建第二個每日時程；沿用既有巡檢任務。分支根目錄的 Vercel Git 自動部署已關閉，避免把舊主站來源重新發布。
