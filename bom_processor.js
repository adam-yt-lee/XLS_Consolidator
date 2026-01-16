/**
 * BOM層級處理器
 * 版本：v2.10.0 (2026-01-16)
 * 功能：
 *   - 支持簡化的LV限制規則 {lv: 2, prefix: 'DCS'}
 *   - operator 固定為 <= (自動)
 *   - 支持單個或多個特殊LV規則
 *   - prefix 支持 | 分隔多個前綴（LV群組功能）
 *   - 自動TTL使用量計算
 *   - Material層級索引和快速查詢
 *   - LN 自動重新編號（修正原始檔案錯誤）
 *   - 嚴格向上查找限制（禁止向下查找）
 *   - 43/45 料號優先級處理（延迟返回机制）
 *
 * 更新記錄：
 *   v2.10.0 (2026-01-16) - 新增：43/45 料號優先級處理邏輯
 *                          - 當找到 43 料號時，繼續向上查找是否有 45 料號
 *                          - 如果找到 45，返回 45；否則返回 43
 *                          - 新增輔助方法：_is43Pattern() 和 _is45Pattern()
 *   v2.9.0 (2026-01-16) - 修復：Material查找邏輯改為嚴格向上查找，禁止向下查找
 *                          - _buildMaterialIndex 改為存儲所有索引（陣列）
 *                          - 新增 _findMaterialBeforeLN 方法限制只查找 LN < currentLN 的行
 *                          - _traverseHierarchyUnified 加入 currentLN 參數傳遞
 *   v2.8.0 (2025-01-23) - 優化：調整優先度順序 FIXED_PATTERN(P2) > SPECIAL_LV_RULES(P3)
 *   v2.7.0 (2025-01-23) - 修復：_traverseHierarchyUnified 向上查找時加入 SPECIAL_LV_RULES 檢查
 *   v2.6.0 (2025-01-23) - prefix 支持 | 分隔多個前綴，實現 LV 群組功能
 *   v2.5.0 (2025-01-23) - 新增 LN 自動重新編號功能
 *   v2.4.0 (2025-01-23) - 簡化設計：移除 operator 參數，固定為 <=
 *   v2.3.0 (2025-01-23) - 支持 operator 操作符設計
 *   v2.2.0 (2025-01-23) - 支持LV範圍限制（minLv/maxLv）
 *   v2.1.0 (2025-01-23) - 支持多規則、完整註記版本
 *   v2.0.0 (2025-01-22) - 初始實現特殊LV規則
 *   v1.0.0 (2024-12-22) - 基礎功能
 */

class BOMHierarchyProcessor {
    /**
     * BOM層級處理器
     *
     * @param {Array<Object>} data - BOM數據
     * @param {string} pattern - 符合條件的Material前綴，如"45|43|64|X75|X66"
     * @param {Object|Array|null} lvSpecialRules - 特殊LV層級規則
     *        - null: 無特殊規則
     *        - {lv: 2, prefix: 'DCS'}: LV <= 2 返回自身，LV > 2 向上尋找
     *        - {lv: 2, prefix: 'DCS|DC02'}: LV <= 2 的 DCS 或 DC02 元件返回自身
     *        - [{lv: 2, prefix: 'DCS|DC02'}, {lv: 3, prefix: 'XYZ'}]: 多個規則
     *
     * 行為（固定 operator 為 <=）：
     *   LV <= 規則中的 lv 值 → 返回自身
     *   LV > 規則中的 lv 值 → 向上尋找
     *
     * prefix 支持 | 分隔多個前綴（v2.6.0）：
     *   'DCS|DC02' 表示同時匹配 DCS 和 DC02 開頭的元件
     */
    constructor(data, pattern, lvSpecialRules = null) {
        this.data = JSON.parse(JSON.stringify(data)); // 深拷貝
        this.pattern = pattern;
        this.lvSpecialRules = lvSpecialRules;

        // 重新編號 LN（修正原始檔案的錯誤編號）
        this._reindexLN();

        // 編譯正則表達式
        try {
            this.materialPattern = new RegExp(`^(${pattern})`);
        } catch (e) {
            console.error('Invalid pattern:', pattern);
            this.materialPattern = /^$/;
        }

        // 初始化Material索引
        this.materialIndex = new Map();
        this.cache = new Map();
        this.visited = new Set();

        // 構建Material索引
        this._buildMaterialIndex();

        // 統計信息
        this._printStats();
    }
    
    /**
     * 重新編號 LN 列
     * 修正原始檔案中可能存在的錯誤編號，從 1 開始順序編號
     * @private
     */
    _reindexLN() {
        if (this.data.length === 0) {
            return;
        }

        let sequence = 1;
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].LN = sequence++;
        }

        console.log(`✓ LN 重新編號完成：1-${sequence - 1}`);
    }

    /**
     * 構建Material索引
     * 存儲所有Material出現的位置（支持重複Material）
     * @private
     */
    _buildMaterialIndex() {
        for (let idx = 0; idx < this.data.length; idx++) {
            const row = this.data[idx];
            const material = String(row.Material || '').trim();

            if (material && material !== '') {
                if (!this.materialIndex.has(material)) {
                    this.materialIndex.set(material, [idx]);
                } else {
                    this.materialIndex.get(material).push(idx);
                }
            }
        }
    }

    /**
     * 查找指定Material在指定LN之前的最後一次出現
     * @param {string} material - Material值
     * @param {number} beforeLN - LN上限（不包含此值）
     * @returns {number|undefined} 索引值，未找到則返回undefined
     * @private
     */
    _findMaterialBeforeLN(material, beforeLN) {
        const indices = this.materialIndex.get(material);
        if (!indices) {
            return undefined;
        }

        // 從後往前查找，找到第一個 LN < beforeLN 的行
        for (let i = indices.length - 1; i >= 0; i--) {
            const idx = indices[i];
            const rowLN = this.data[idx].LN || 0;
            if (rowLN < beforeLN) {
                return idx;
            }
        }

        return undefined;
    }
    
    /**
     * 打印初始化統計信息
     * @private
     */
    _printStats() {
        const uniqueProducts = new Set(this.data.map(row => row.Product)).size;
        // 計算 Material 總出現次數
        let totalMaterialOccurrences = 0;
        for (let indices of this.materialIndex.values()) {
            totalMaterialOccurrences += indices.length;
        }

        console.log('✓ BOM Hierarchy Processor 初始化成功');
        console.log(`  - 總行數：${this.data.length}`);
        console.log(`  - Material索引數：${this.materialIndex.size} (總出現次數：${totalMaterialOccurrences})`);
        console.log(`  - 搜尋Pattern：${this.pattern}`);

        if (this.lvSpecialRules) {
            if (Array.isArray(this.lvSpecialRules)) {
                console.log(`  - 特殊規則數：${this.lvSpecialRules.length}`);
                this.lvSpecialRules.forEach((rule, idx) => {
                    const prefixes = rule.prefix.split('|').map(p => p.trim());
                    const prefixDisplay = prefixes.length > 1
                        ? `前綴群組=[${prefixes.join(', ')}]`
                        : `前綴='${rule.prefix}'`;
                    console.log(`    └─ 規則${idx + 1}：LV <= ${rule.lv} 且 ${prefixDisplay} (返回自身)`);
                });
            } else {
                const prefixes = this.lvSpecialRules.prefix.split('|').map(p => p.trim());
                const prefixDisplay = prefixes.length > 1
                    ? `前綴群組=[${prefixes.join(', ')}]`
                    : `前綴='${this.lvSpecialRules.prefix}'`;
                console.log(`  - 特殊規則：LV <= ${this.lvSpecialRules.lv} 且 ${prefixDisplay} (返回自身)`);
            }
        }

        console.log(`  - Product數量：${uniqueProducts}`);
    }
    
    /**
     * 檢查Material是否符合Pattern
     * @param {string} material - Material值
     * @returns {boolean}
     */
    matchesPattern(material) {
        if (!material || material === '') {
            return false;
        }
        return this.materialPattern.test(String(material));
    }

    /**
     * 檢查Material是否為43料號
     * @param {string} material - Material值
     * @returns {boolean}
     */
    _is43Pattern(material) {
        return /^43/.test(String(material || '').trim());
    }

    /**
     * 檢查Material是否為45料號
     * @param {string} material - Material值
     * @returns {boolean}
     */
    _is45Pattern(material) {
        return /^45/.test(String(material || '').trim());
    }

    /**
     * 檢查Material是否以指定前綴開頭
     * @param {string} material
     * @param {string} prefix
     * @returns {boolean}
     * @private
     */
    _startsWith(material, prefix) {
        return String(material || '').trim().startsWith(prefix);
    }
    
    /**
     * 檢查是否符合特殊LV規則（返回自身）
     * 
     * 配置方式：
     * {lv: 2, prefix: 'DCS'}
     *   - LV <= 2 時返回自身
     *   - LV > 2 時向上尋找
     * 
     * @param {number} lv
     * @param {string} material
     * @returns {boolean}
     * @private
     */
    _matchesLVSpecialRule(lv, material) {
        if (!this.lvSpecialRules) {
            return false;
        }
        
        // 如果是陣列，檢查是否符合任一規則
        if (Array.isArray(this.lvSpecialRules)) {
            return this.lvSpecialRules.some(rule =>
                this._checkSingleRule(lv, material, rule)
            );
        }
        
        // 單個物件
        return this._checkSingleRule(lv, material, this.lvSpecialRules);
    }
    
    /**
     * 檢查單個規則是否匹配（返回自身）
     * 固定 operator 為 <=
     *
     * @param {number} lv - 層級值
     * @param {string} material - Material 值
     * @param {Object} rule - 規則物件 {lv: number, prefix: string}
     *                        prefix 支持 | 分隔多個前綴，例如 'DCS|DC02'
     * @returns {boolean}
     * @private
     */
    _checkSingleRule(lv, material, rule) {
        // 檢查前綴（支持 | 分隔的多個前綴）
        const prefixes = rule.prefix.split('|').map(p => p.trim());
        const matchesPrefix = prefixes.some(prefix => this._startsWith(material, prefix));

        if (!matchesPrefix) {
            return false;
        }

        // 固定使用 <= 判斷
        return lv <= rule.lv;
    }
    
    /**
     * 統一的層級遞迴遍歷函數
     * @param {string} startMaterial - 起始Material
     * @param {number} initialUsage - 初始用量
     * @param {number} depth - 遞迴深度
     * @param {number} maxDepth - 最大遞迴深度
     * @param {number} currentLN - 當前行的LN（用於限制只向上查找）
     * @private
     */
    _traverseHierarchyUnified(startMaterial, initialUsage = 1.0, depth = 0, maxDepth = 20, currentLN = Infinity) {
        if (depth > maxDepth) {
            return [startMaterial, initialUsage];
        }

        try {
            // 只查找LN小於currentLN的Material
            const currentIdx = this._findMaterialBeforeLN(startMaterial, currentLN);
            if (currentIdx === undefined) {
                return [startMaterial, initialUsage];
            }

            const currentRow = this.data[currentIdx];
            const currentRowLN = currentRow.LN || 0;
            const currentLV = currentRow.LV || -1;

            if (this.visited.has(startMaterial)) {
                return [startMaterial, initialUsage];
            }

            this.visited.add(startMaterial);

            try {
                const parentPartNumber = currentRow['Part Number'] || '';

                if (currentLV <= 0 || !parentPartNumber || parentPartNumber === '') {
                    return [startMaterial, initialUsage];
                }

                const parentMaterial = String(parentPartNumber).trim();
                // 只查找LN小於當前行的父層Material
                const parentIdx = this._findMaterialBeforeLN(parentMaterial, currentRowLN);

                if (parentIdx === undefined) {
                    return [startMaterial, initialUsage];
                }

                const parentRow = this.data[parentIdx];

                let parentUnitUsg = parentRow['Unit Usg'] || 1.0;
                if (isNaN(parentUnitUsg)) {
                    parentUnitUsg = 1.0;
                } else {
                    parentUnitUsg = parseFloat(parentUnitUsg);
                }

                const newUsage = initialUsage * parentUnitUsg;

                // 優先檢查父層是否符合 FIXED_PATTERN（主要規則）
                if (this.matchesPattern(parentRow.Material)) {
                    // 特殊處理：43 料號需要繼續向上查找是否有 45
                    if (this._is43Pattern(parentRow.Material)) {
                        // 繼續向上查找
                        const [upstreamMaterial, finalTtlUsage] = this._traverseHierarchyUnified(
                            parentMaterial,
                            newUsage,
                            depth + 1,
                            maxDepth,
                            currentRowLN
                        );

                        // 如果向上找到了 45，返回 45；否則返回當前的 43
                        if (this._is45Pattern(upstreamMaterial)) {
                            return [upstreamMaterial, finalTtlUsage];
                        } else {
                            return [parentRow.Material, finalTtlUsage];
                        }
                    }

                    // 其他 pattern（包括 45、64、X75 等）：繼續向上查找以累計 Ttl. Usage
                    const [_, finalTtlUsage] = this._traverseHierarchyUnified(
                        parentMaterial,
                        newUsage,
                        depth + 1,
                        maxDepth,
                        currentRowLN  // 傳遞當前LN限制
                    );
                    return [parentRow.Material, finalTtlUsage];
                }

                // 再檢查父層是否符合 SPECIAL_LV_RULES（補充規則）
                const parentLV = parentRow.LV || -1;
                if (this._matchesLVSpecialRule(parentLV, parentRow.Material)) {
                    return [parentRow.Material, newUsage];
                }

                // 否則繼續向上遞迴查找
                const [parentSysCpn, parentTtlUsage] = this._traverseHierarchyUnified(
                    parentMaterial,
                    newUsage,
                    depth + 1,
                    maxDepth,
                    currentRowLN  // 傳遞當前LN限制
                );

                return [parentSysCpn, parentTtlUsage];
            } finally {
                this.visited.delete(startMaterial);
            }
        } catch (e) {
            console.error(`遍歷層級時出錯 (Material: ${startMaterial}):`, e);
            return [startMaterial, initialUsage];
        }
    }
    
    /**
     * 處理所有行，返回添加了SYS_CPN和Ttl. Usage欄位的數據
     *
     * 完整處理流程圖：
     * ┌─────────────────────────────────────┐
     * │ 開始處理元件 (Material, LV)          │
     * └─────────────────┬───────────────────┘
     *                   ▼
     *       ┌───────────────────────┐
     *       │ 優先度 1：LV ≤ 1？     │
     *       └─────┬─────────────┬───┘
     *             │ YES         │ NO
     *             ▼             ▼
     *        ┌────────┐   ┌────────────────────────┐
     *        │返回自身│   │ 優先度 2：FIXED_PATTERN？│
     *        │✅ (P1) │   │ (Material符合Pattern)   │
     *        └────────┘   └─────┬──────────────┬───┘
     *                           │ YES          │ NO
     *                           ▼              ▼
     *                      ┌────────┐   ┌─────────────────────────────┐
     *                      │返回自身│   │ 優先度 3：SPECIAL_LV_RULES？ │
     *                      │✅ (P2) │   │ (prefix匹配 且 LV ≤ 設定值)  │
     *                      └────────┘   └─────┬───────────────────┬───┘
     *                                         │ YES               │ NO
     *                                         ▼                   ▼
     *                                    ┌────────┐   ┌──────────────┐
     *                                    │返回自身│   │ 優先度 4：    │
     *                                    │✅ (P3) │   │ 遞迴向上查詢  │
     *                                    └────────┘   │ Part Number  │
     *                                                 └──────┬───────┘
     *                                                        ▼
     *                                             ┌────────────────────┐
     *                                             │ 向上查詢父層元件    │
     *                                             │ (重複上述流程)     │
     *                                             └────────────────────┘
     *
     * @returns {Array<Object>}
     */
    process() {
        console.log(`\n開始處理 ${this.data.length} 行數據...`);

        const sysCpnResults = [];
        const ttlUsageResults = [];

        for (let idx = 0; idx < this.data.length; idx++) {
            const row = this.data[idx];
            const currentMaterial = String(row.Material || '');
            const currentLV = row.LV;
            const currentLN = row.LN || 0;

            let unitUsg = row['Unit Usg'] || 1.0;
            if (isNaN(unitUsg)) {
                unitUsg = 1.0;
            } else {
                unitUsg = parseFloat(unitUsg);
            }

            // 步驟1：LV檢查（頂層）
            if (currentLV <= 1) {
                sysCpnResults.push(currentMaterial);
                ttlUsageResults.push(unitUsg);
                continue;
            }

            // 步驟2：Material本身已符合Pattern（主要規則）
            if (this.matchesPattern(currentMaterial)) {
                sysCpnResults.push(currentMaterial);

                // 計算Ttl. Usage
                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    currentMaterial,
                    unitUsg,
                    0,
                    20,
                    currentLN  // 傳遞當前LN，確保只向上查找
                );
                ttlUsageResults.push(ttlUsage);
                continue;
            }

            // 步驟3：特殊LV規則檢查（補充規則，支持單個或多個規則）
            if (this._matchesLVSpecialRule(currentLV, currentMaterial)) {
                sysCpnResults.push(currentMaterial);

                // 計算Ttl. Usage（向上累乘至LV=0）
                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    currentMaterial,
                    unitUsg,
                    0,
                    20,
                    currentLN  // 傳遞當前LN，確保只向上查找
                );
                ttlUsageResults.push(ttlUsage);
                continue;
            }

            // 步驟4：遞迴向上查詢
            const currentPartNumber = row['Part Number'] || '';

            if (!currentPartNumber || currentPartNumber === '') {
                sysCpnResults.push(currentMaterial);
                ttlUsageResults.push(unitUsg);
                continue;
            }

            this.visited.clear();

            const parentMaterialStr = String(currentPartNumber).trim();

            if (this.matchesPattern(parentMaterialStr)) {
                sysCpnResults.push(parentMaterialStr);

                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    parentMaterialStr,
                    unitUsg,
                    0,
                    20,
                    currentLN  // 傳遞當前LN，確保只向上查找
                );
                ttlUsageResults.push(ttlUsage);
            } else {
                const [sysCpn, ttlUsage] = this._traverseHierarchyUnified(
                    parentMaterialStr,
                    unitUsg,
                    0,
                    20,
                    currentLN  // 傳遞當前LN，確保只向上查找
                );

                sysCpnResults.push(sysCpn || currentMaterial);
                ttlUsageResults.push(ttlUsage);
            }
        }

        // 將結果添加到原數據
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].SYS_CPN = sysCpnResults[i];
            this.data[i]['Ttl. Usage'] = ttlUsageResults[i];
        }

        console.log('✓ 處理完成');
        return this.data;
    }
    
    /**
     * 獲取統計信息
     * @returns {Object}
     */
    getStatistics() {
        const sysCpnChanged = this.data.filter(row => row.Material !== row.SYS_CPN).length;
        const ttlUsages = this.data.map(row => row['Ttl. Usage'] || 0).filter(v => !isNaN(v));
        
        return {
            totalRows: this.data.length,
            sysCpnChanged: sysCpnChanged,
            sysCpnChangedPercent: ((sysCpnChanged / this.data.length) * 100).toFixed(1),
            sysCpnUnchanged: this.data.length - sysCpnChanged,
            sysCpnUnchangedPercent: (((this.data.length - sysCpnChanged) / this.data.length) * 100).toFixed(1),
            ttlUsageAvg: ttlUsages.length > 0 ? (ttlUsages.reduce((a, b) => a + b, 0) / ttlUsages.length).toFixed(4) : 0,
            ttlUsageMin: ttlUsages.length > 0 ? Math.min(...ttlUsages).toFixed(4) : 0,
            ttlUsageMax: ttlUsages.length > 0 ? Math.max(...ttlUsages).toFixed(4) : 0,
            ttlUsageStd: ttlUsages.length > 0 ? this._calculateStdDev(ttlUsages).toFixed(4) : 0
        };
    }
    
    /**
     * 計算標準差
     * @private
     */
    _calculateStdDev(arr) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }
    
    /**
     * 獲取指定行數的樣本數據
     * @param {number} limit
     * @returns {Array<Object>}
     */
    getSamples(limit = 20) {
        return this.data
            .filter(row => row.LV > 1 && row.Material !== row.SYS_CPN)
            .slice(0, limit);
    }
}
