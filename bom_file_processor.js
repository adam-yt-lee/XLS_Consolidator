/**
 * BOM 檔案處理器
 * 版本：v1.0.0 (2026-01-23)
 * 功能：
 *   - 處理 BOM 專用的檔案格式邏輯
 *   - Plant Code 處理
 *   - 檔案元數據提取（產品代碼、版本號）
 *   - 欄位索引查找
 *   - 字串欄位格式化（產品代碼去除前導零）
 *   - 輸出資料格式化
 *
 * 設計原則：
 *   - 分離檔案格式邏輯與通用檔案處理邏輯
 *   - 便於未來擴展其他格式的 XLS 檔案處理
 */

class BOMFileProcessor {
    /**
     * BOM 檔案處理器建構函數
     *
     * @param {Object} config - 配置物件
     * @param {Array<string>} config.numericHeadersInclude - 需要轉換為數字的欄位關鍵字（部分匹配）
     * @param {Array<string>} config.numericHeadersExact - 需要轉換為數字的欄位名稱（完全匹配）
     * @param {Array<string>} config.stringIdHeaders - 需要格式化為字串 ID 的欄位
     */
    constructor(config) {
        this.config = {
            numericHeadersInclude: config.numericHeadersInclude || ['usg', 'price', 'qty'],
            numericHeadersExact: config.numericHeadersExact || ['lv'],
            stringIdHeaders: config.stringIdHeaders || ['product', 'part number', 'material']
        };
    }

    /**
     * 處理 Plant Code 欄位
     * 如果第二行的 Plant Code 為空，從後續行中查找並填充
     *
     * @param {Array<Array>} data - CSV 解析後的資料陣列（含標題列）
     * @returns {Array<Array>} 處理後的資料
     */
    handlePlantCode(data) {
        if (data.length <= 1) {
            return data;
        }

        const plantCodeIndex = data[0].findIndex(h => h.trim().toLowerCase() === 'plant code');

        if (plantCodeIndex !== -1) {
            // 檢查第二行（索引1）的 Plant Code 是否為空
            if (!data[1][plantCodeIndex] || String(data[1][plantCodeIndex]).trim() === '') {
                // 從第三行（索引2）開始往下找
                for (let j = 2; j < data.length; j++) {
                    if (data[j][plantCodeIndex] && String(data[j][plantCodeIndex]).trim() !== '') {
                        data[1][plantCodeIndex] = data[j][plantCodeIndex];
                        console.log(`✓ Plant Code 填充：從 LN=${j+1} 填充到 LN=2，值為 ${data[j][plantCodeIndex]}`);
                        break;
                    }
                }
            }
        }

        return data;
    }

    /**
     * 解析檔案名稱，提取產品代碼和版本號
     *
     * @param {string} filename - 檔案名稱
     * @returns {Object} {product: string, version: string}
     *
     * 支援格式 (Supported formats):
     * - 標準格式: PRODUCT_ID_YYYYMMDDHHMMSS.xls (11字元產品ID + 14位時間戳)
     * - 簡化格式: PRODUCT_VERSION.xls
     */
    parseFilename(filename) {
        // 嘗試匹配標準格式：11字元產品ID + 14位時間戳
        const match = filename.match(/([\w\d]{11})_(\d{14})/);
        if (match) return { product: match[1], version: match[2] };

        // 簡化格式：移除副檔名後用底線分割
        const [product, version] = filename.replace(/\.[^/.]+$/, '').split('_');
        return { product: product || '', version: version?.match(/\d+/)?.[0] || '' };
    }

    /**
     * 格式化產品代碼
     * 純數字產品代碼會去除前導零
     *
     * @param {string|number} product - 產品代碼
     * @returns {string} 格式化後的產品代碼
     */
    formatProduct(product) {
        if (/^\d+$/.test(product)) {
            return Number(product).toString();
        } else {
            return product;
        }
    }

    /**
     * 查找資料欄位索引
     *
     * @param {Array<string>} headers - 標題列陣列
     * @returns {Object} 包含各種欄位索引的物件
     *
     * 返回欄位 (Returned fields):
     * - lvIndex: LV欄位索引（必要）
     * - unitUsgIndex: Unit Usg欄位索引（必要）
     * - lnIndex: LN欄位索引
     * - materialIndex: Material欄位索引
     * - partNumberIndex: Part Number欄位索引
     * - numericColumnIndices: 所有數字欄位索引陣列
     * - stringColumnIndices: 所有字串ID欄位索引陣列
     */
    findColumnIndices(headers) {
        const trimmedHeaders = headers.map(h => h.trim());

        // 查找必要欄位索引
        const lvIndex = trimmedHeaders.findIndex(h => h.toLowerCase() === 'lv');
        const unitUsgIndex = trimmedHeaders.findIndex(h => h.toLowerCase() === 'unit usg');
        const lnIndex = trimmedHeaders.findIndex(h => h.toLowerCase() === 'ln');
        const materialIndex = trimmedHeaders.findIndex(h => h.toLowerCase() === 'material');
        const partNumberIndex = trimmedHeaders.findIndex(h => h.toLowerCase() === 'part number');

        // 查找數字和字串欄位索引
        const numericColumnIndices = [];
        const stringColumnIndices = [];

        trimmedHeaders.forEach((header, index) => {
            const h = header.toLowerCase();

            // 判斷是否為數字欄位
            if (this.config.numericHeadersInclude.some(kw => h.includes(kw)) ||
                this.config.numericHeadersExact.includes(h)) {
                numericColumnIndices.push(index);
            }

            // 判斷是否為字串ID欄位
            if (this.config.stringIdHeaders.includes(h)) {
                stringColumnIndices.push(index);
            }
        });

        return {
            lvIndex,
            unitUsgIndex,
            lnIndex,
            materialIndex,
            partNumberIndex,
            numericColumnIndices,
            stringColumnIndices,
            trimmedHeaders
        };
    }

    /**
     * 格式化字串欄位（應用 formatProduct）
     *
     * @param {Array<Array>} data - 資料陣列（含標題列）
     * @param {Array<number>} stringIndices - 字串欄位索引陣列
     */
    formatStringFields(data, stringIndices) {
        // 從索引1開始，跳過標題列
        for (let i = 1; i < data.length; i++) {
            if (!data[i]) continue;

            // 格式化字串欄位
            stringIndices.forEach(colIndex => {
                if (data[i][colIndex] != null) {
                    data[i][colIndex] = this.formatProduct(String(data[i][colIndex]));
                }
            });
        }
    }

    /**
     * 格式化輸出資料
     *
     * @param {Array<Object>} processedData - 處理後的資料物件陣列
     * @param {Array<string>} headers - 原始標題列
     * @param {string} product - 產品代碼
     * @param {string} version - 版本號
     * @param {boolean} isFirstFile - 是否為第一個檔案（決定是否包含標題列）
     * @param {Object} translations - 翻譯物件
     * @returns {Array<Array>} 格式化後的輸出資料陣列
     */
    formatOutputData(processedData, headers, product, version, isFirstFile, translations) {
        const outputHeaders = [translations.productHeader, translations.versionHeader, ...headers];

        // 檢查是否有 BOM 處理器新增的欄位
        const hasSysCpn = processedData.length > 0 && processedData[0]['SYS_CPN'] !== undefined;
        const hasTtlUsage = processedData.length > 0 && processedData[0]['Ttl. Usage'] !== undefined;

        if (hasSysCpn) outputHeaders.push('SYS_CPN');
        if (hasTtlUsage) outputHeaders.push('Ttl. Usage');

        // 第一個檔案需要包含標題列
        const outputData = isFirstFile ? [outputHeaders] : [];

        // 轉換每一行資料
        for (let obj of processedData) {
            const outputRow = [product, version];

            headers.forEach(header => {
                outputRow.push(obj[header] !== undefined ? obj[header] : null);
            });

            if (hasSysCpn) outputRow.push(obj['SYS_CPN']);
            if (hasTtlUsage) outputRow.push(obj['Ttl. Usage']);

            outputData.push(outputRow);
        }

        return outputData;
    }
}
