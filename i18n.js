// ##################################################################################################################################################
// 語言包 (Language Pack)
// ##################################################################################################################################################

let currentLanguage = 'zh-TW';

const translations = {
    'zh-TW': {
        // UI标题和标签
        title: 'XLS合併工具',
        subtitle: '從SAP ZSDR392下載的XLS檔案\n進行自動化合併處理&新增欄位',
        inputTitle: '📥 輸入數據',
        typeLabel: '選擇輸入類型',
        selectLabel: '選擇',
        selectBtnFile: '📄 選擇檔案',
        selectBtnFolder: '📁 選擇資料夾',
        selectBtnZip: '📦 選擇ZIP',
        processBtn: '⚙️ 開始處理',
        statsTitle: '📊 處理結果統計',
        statFileCountLabel: '檔案數量',
        statTotalRowsLabel: '總行數',
        statElapsedTimeLabel: '處理耗時',
        statAvgTimeLabel: '平均檔案耗時',
        statThroughputLabel: '吞吐量',
        footerText: '✨ XLS合併工具 v20260107 | Adam @仁寶電腦 伺服器 #55095',
        pathEmpty: '未選擇任何檔案',

        // 按钮标签
        optFile: '📄 檔案',
        optFolder: '📁 資料夾',
        optZip: '📦 壓縮檔(.zip)',

        // 消息和反馈文本
        selectError: '✗ 請先選擇檔案',
        processSuccess: '✓ 數據處理成功！',
        downloadSuccess: '✓ 檔案已下載',
        filesSelectedMsg: '✓ 已選擇',
        filesSelectedCount: '個檔案',
        filesExtractedMsg: '✓ 已提取',
        filesExtractedCount: '個檔案',
        zipParseFailed: '✗ 解析ZIP失敗: ',
        processFailed: '✗ 處理失敗: ',
        fileCountText: '個檔案',

        // 单位
        millisUnit: 'ms',
        rowsPerSecUnit: '行/秒',

        // 表头标签（CSV/Excel）
        productHeader: 'Product',
        versionHeader: 'Version'
    },
    'en': {
        // UI标题和标签
        title: 'XLS Consolidator',
        subtitle: 'XLS files downloaded from SAP ZSDR392:\nAutomated consolidation & adding new columns',
        inputTitle: '📥 Input Data',
        typeLabel: 'Select Input Type',
        selectLabel: 'Select',
        selectBtnFile: '📄 Select File',
        selectBtnFolder: '📁 Select Folder',
        selectBtnZip: '📦 Select ZIP',
        processBtn: '⚙️ Start Processing',
        statsTitle: '📊 Processing Results',
        statFileCountLabel: 'File Count',
        statTotalRowsLabel: 'Total Rows',
        statElapsedTimeLabel: 'Processing Time',
        statAvgTimeLabel: 'Avg File Time',
        statThroughputLabel: 'Throughput',
        footerText: '✨ XLS Consolidator v20260107 | Adam @Compal Server #55095',
        pathEmpty: 'No files selected',

        // 按钮标签
        optFile: '📄 File',
        optFolder: '📁 Folder',
        optZip: '📦 ZIP',

        // 消息和反馈文本
        selectError: '✗ Please select files first',
        processSuccess: '✓ Data processing completed!',
        downloadSuccess: '✓ File downloaded',
        filesSelectedMsg: '✓ Selected',
        filesSelectedCount: 'files',
        filesExtractedMsg: '✓ Extracted',
        filesExtractedCount: 'files',
        zipParseFailed: '✗ ZIP parsing failed: ',
        processFailed: '✗ Processing failed: ',
        fileCountText: 'files',

        // 单位
        millisUnit: 'ms',
        rowsPerSecUnit: 'rows/sec',

        // 表头标签（CSV/Excel）
        productHeader: 'Product',
        versionHeader: 'Version'
    }
};
