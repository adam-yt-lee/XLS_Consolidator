/**
 * Archive Handler - 使用 libarchive.js 處理壓縮檔
 * 支援 ZIP 和 7z 格式
 */
import { Archive } from './lib/libarchive/libarchive.js';

// 初始化 libarchive
Archive.init({
    workerUrl: './lib/libarchive/worker-bundle.js'
});

/**
 * 從壓縮檔中提取 .xls 檔案
 * @param {File} archiveFile - 壓縮檔 (zip 或 7z)
 * @returns {Promise<File[]>} - 提取出的 .xls 檔案陣列
 */
export async function extractXlsFromArchive(archiveFile) {
    const xlsFiles = [];

    try {
        // 開啟壓縮檔
        const archive = await Archive.open(archiveFile);

        // 提取所有檔案
        const filesObject = await archive.extractFiles();

        // 遞迴處理檔案物件，找出所有 .xls 檔案
        function processFiles(obj, path = '') {
            for (const key in obj) {
                const item = obj[key];
                if (item instanceof File) {
                    // 檢查是否為 .xls 檔案（排除 .xlsx）
                    const fileName = item.name.toLowerCase();
                    if (fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
                        // 保留完整路徑作為檔名
                        const fullPath = path ? `${path}/${key}` : key;
                        xlsFiles.push(new File([item], fullPath, { type: item.type }));
                    }
                } else if (typeof item === 'object' && item !== null) {
                    // 遞迴處理子目錄
                    processFiles(item, path ? `${path}/${key}` : key);
                }
            }
        }

        processFiles(filesObject);

        // 關閉壓縮檔
        await archive.close();

    } catch (error) {
        console.error('Archive extraction error:', error);
        throw error;
    }

    return xlsFiles;
}
