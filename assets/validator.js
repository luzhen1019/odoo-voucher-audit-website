/* Voucher validation engine — browser port of services/validator.py.
   Pure functions, no DOM. Attaches window.VoucherEngine. */
(function (root) {
  'use strict';

  var ERROR = 'error';
  var WARNING = 'warning';

  var DEFAULT_RULES = [
    { code: 'R001', name: '借贷平衡校验', name_en: 'Balance check', rule_type: 'balance', severity: ERROR, threshold: 0.01, active: true,
      description: '同一凭证号下借方合计与贷方合计的差额不得超过容差。',
      description_en: 'Debit total minus credit total per voucher must stay within tolerance.' },
    { code: 'R002', name: '重复发票号校验', name_en: 'Duplicate invoice', rule_type: 'duplicate_invoice', severity: ERROR, threshold: 0, active: true,
      description: '同一发票号不得出现在多个凭证中，也不得与历史批次重复。',
      description_en: 'An invoice number may not appear in several vouchers or repeat a historical batch.' },
    { code: 'R003', name: '金额符号校验', name_en: 'Amount sign', rule_type: 'amount_sign', severity: WARNING, threshold: 0, active: true,
      description: '借贷金额不得为负，单行不得同时有借方和贷方，金额不得为空或为零。',
      description_en: 'No negative amounts, no debit and credit on one line, and the amount must be positive.' },
    { code: 'R004', name: '期间逻辑校验', name_en: 'Period logic', rule_type: 'period', severity: ERROR, threshold: 180, active: true,
      description: '会计期间应与凭证日期一致；发票日期不得晚于凭证日期，且账龄不得超过 180 天。',
      description_en: 'Period must match the voucher month; invoice date must not follow the voucher; aging ≤ 180 days.' },
    { code: 'R005', name: '必填字段校验', name_en: 'Required fields', rule_type: 'required_fields', severity: ERROR, threshold: 0, active: true,
      description: '凭证号、凭证日期、科目编码、供应商名称、发票号码和金额不得为空。',
      description_en: 'Voucher number, date, account, supplier, invoice number and amount are required.' },
    { code: 'R006', name: '科目合规校验', name_en: 'Account compliance', rule_type: 'account_compliance', severity: WARNING, threshold: 0, active: true,
      allowed_account_codes: '6601,6602,6603,1001,1002,2202',
      description: '费用和往来科目应落在允许的科目清单内；支持 6601.01 这类前缀匹配。',
      description_en: 'Expense and payable accounts must be in the allowed list; 6601.01-style prefixes match.' },
    { code: 'R007', name: '差旅费报销限额', name_en: 'Travel expense limit', rule_type: 'expense_limit', severity: ERROR, threshold: 5000, active: true,
      expense_type: '差旅费', description: '差旅费单笔金额不得超过 5,000 元。',
      description_en: 'A single travel-expense line may not exceed 5,000.' },
    { code: 'R008', name: '业务招待费报销限额', name_en: 'Entertainment limit', rule_type: 'expense_limit', severity: ERROR, threshold: 2000, active: true,
      expense_type: '业务招待费', description: '业务招待费单笔金额不得超过 2,000 元。',
      description_en: 'A single entertainment-expense line may not exceed 2,000.' },
    { code: 'R009', name: '供应商黑名单校验', name_en: 'Supplier blacklist', rule_type: 'supplier_blacklist', severity: ERROR, threshold: 0, active: true,
      blacklist_suppliers: ['黑名单供应商A', '黑名单供应商B'],
      description: '供应商名称命中黑名单时直接标记为异常。',
      description_en: 'A supplier matching the blacklist is flagged immediately.' },
    { code: 'R010', name: '审批层级校验', name_en: 'Approval level', rule_type: 'approval_level', severity: WARNING, threshold: 10000, active: true,
      description: '单笔金额超过 10,000 元时，审批层级至少为 2 级。',
      description_en: 'Amounts above 10,000 require approval level 2 or higher.' }
  ];

  function defaultRules() {
    return JSON.parse(JSON.stringify(DEFAULT_RULES));
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    var text = String(value).trim();
    text = text.replace(/[,，¥￥\s]/g, '');
    if (!text) return 0;
    if (text.charAt(0) === '(' && text.charAt(text.length - 1) === ')') {
      text = '-' + text.slice(1, -1);
    }
    var number = Number(text);
    return isFinite(number) ? number : 0;
  }

  function makeDate(year, month, day) {
    var d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return d;
  }

  function serialToDate(serial) {
    var number = Number(serial);
    if (!isFinite(number) || number < 1 || number > 100000) return null;
    var base = Date.UTC(1899, 11, 30);
    var d = new Date(base + Math.trunc(number) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return makeDate(value.getFullYear(), value.getMonth() + 1, value.getDate()) ||
        makeDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    if (typeof value === 'number') return serialToDate(value);
    var text = String(value).trim();
    if (!text) return null;
    text = text.split(/[ T]/)[0].replace(/日/g, '');
    var m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return makeDate(+m[1], +m[2], +m[3]);
    m = text.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return makeDate(+m[1], +m[2], +m[3]);
    m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return makeDate(+m[1], +m[2], +m[3]);
    if (/^\d{5}(\.\d+)?$/.test(text)) return serialToDate(parseFloat(text));
    return null;
  }

  function ymd(date) {
    if (!date) return '';
    var y = date.getUTCFullYear();
    var m = String(date.getUTCMonth() + 1).padStart(2, '0');
    var d = String(date.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function todayUTC() {
    var now = new Date();
    return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function text(value) {
    if (value === null || value === undefined || value === false) return '';
    return String(value).trim();
  }

  function money(value) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function rowAmount(row) {
    var amount = toNumber(row.amount);
    if (amount) return amount;
    var debit = toNumber(row.debit);
    var credit = toNumber(row.credit);
    return debit || credit;
  }

  function validateRows(rows, rules, existingInvoiceNos) {
    rows = Array.isArray(rows) ? rows : [];
    var activeRules = (rules || []).filter(function (rule) { return rule.active !== false; });
    var existing = {};
    (existingInvoiceNos || []).forEach(function (item) {
      var value = text(item);
      if (value) existing[value] = true;
    });

    var states = rows.map(function () {
      return { codes: [], details: [], has_error: false, has_warning: false };
    });

    function add(index, rule, detail) {
      var code = rule.code || rule.rule_type || 'ANOMALY';
      var state = states[index];
      if (state.codes.indexOf(code) === -1) state.codes.push(code);
      if (state.details.indexOf(detail) === -1) state.details.push(detail);
      if ((rule.severity || ERROR) === ERROR) state.has_error = true;
      else state.has_warning = true;
    }

    var voucherDebit = {};
    var voucherCredit = {};
    var invoiceIndexes = {};
    rows.forEach(function (row, index) {
      var voucherNo = text(row.voucher_no);
      voucherDebit[voucherNo] = (voucherDebit[voucherNo] || 0) + toNumber(row.debit);
      voucherCredit[voucherNo] = (voucherCredit[voucherNo] || 0) + toNumber(row.credit);
      var invoiceNo = text(row.invoice_no);
      if (invoiceNo) {
        if (!invoiceIndexes[invoiceNo]) invoiceIndexes[invoiceNo] = [];
        invoiceIndexes[invoiceNo].push(index);
      }
    });

    var byType = {};
    activeRules.forEach(function (rule) {
      if (!byType[rule.rule_type]) byType[rule.rule_type] = [];
      byType[rule.rule_type].push(rule);
    });

    // R001 balance
    (byType.balance || []).forEach(function (rule) {
      var tolerance = toNumber(rule.threshold) || 0.01;
      Object.keys(voucherDebit).forEach(function (voucherNo) {
        var debit = voucherDebit[voucherNo];
        var credit = voucherCredit[voucherNo] || 0;
        if (Math.abs(debit - credit) > tolerance) {
          var detail = '凭证 ' + (voucherNo || '（空凭证号）') + ' 借贷不平衡：借方 ' +
            money(debit) + '，贷方 ' + money(credit) + '，差额 ' + money(debit - credit);
          rows.forEach(function (row, index) {
            if (text(row.voucher_no) === voucherNo) add(index, rule, detail);
          });
        }
      });
    });

    // R002 duplicate invoices
    (byType.duplicate_invoice || []).forEach(function (rule) {
      Object.keys(invoiceIndexes).forEach(function (invoiceNo) {
        var indexes = invoiceIndexes[invoiceNo];
        var voucherNos = {};
        indexes.forEach(function (index) { voucherNos[text(rows[index].voucher_no)] = true; });
        var voucherList = Object.keys(voucherNos);
        if (voucherList.length > 1) {
          var detail = '发票号 ' + invoiceNo + ' 出现在多个凭证中：' + voucherList.sort().join('、');
          indexes.forEach(function (index) { add(index, rule, detail); });
        }
        if (existing[invoiceNo]) {
          indexes.forEach(function (index) {
            add(index, rule, '发票号 ' + invoiceNo + ' 已存在于历史批次');
          });
        }
      });
    });

    // R003 amount signs
    (byType.amount_sign || []).forEach(function (rule) {
      rows.forEach(function (row, index) {
        var debit = toNumber(row.debit);
        var credit = toNumber(row.credit);
        var amount = toNumber(row.amount);
        if (debit < 0 || credit < 0) {
          add(index, rule, '借贷金额为负：借方 ' + money(debit) + '，贷方 ' + money(credit));
        }
        if (debit > 0 && credit > 0) {
          add(index, rule, '借贷双方同时有值：借方 ' + money(debit) + '，贷方 ' + money(credit));
        }
        if (amount <= 0 && debit <= 0 && credit <= 0) {
          add(index, rule, '金额为空或小于等于 0');
        }
      });
    });

    // R004 period logic
    var today = todayUTC();
    (byType.period || []).forEach(function (rule) {
      var maxAge = Math.trunc(toNumber(rule.threshold));
      rows.forEach(function (row, index) {
        var voucherDate = toDate(row.voucher_date);
        var invoiceDate = toDate(row.invoice_date);
        var period = text(row.period);
        var normalizedPeriod = period.replace(/[/.]/g, '-');
        if (voucherDate) {
          if (voucherDate.getTime() > today.getTime()) {
            add(index, rule, '凭证日期 ' + ymd(voucherDate) + ' 晚于今天');
          }
          if (normalizedPeriod && normalizedPeriod.slice(0, 7) !== ymd(voucherDate).slice(0, 7)) {
            add(index, rule, '会计期间 ' + period + ' 与凭证日期 ' + ymd(voucherDate) + ' 不一致');
          }
        }
        if (voucherDate && invoiceDate && invoiceDate.getTime() > voucherDate.getTime()) {
          add(index, rule, '发票日期 ' + ymd(invoiceDate) + ' 晚于凭证日期 ' + ymd(voucherDate));
        }
        if (voucherDate && invoiceDate && maxAge > 0 &&
            Math.round((voucherDate - invoiceDate) / 86400000) > maxAge) {
          add(index, rule, '发票日期 ' + ymd(invoiceDate) + ' 距凭证日期 ' + ymd(voucherDate) +
            ' 超过 ' + maxAge + ' 天');
        }
      });
    });

    // R005 required fields
    var requiredFields = [
      ['voucher_no', '凭证号'], ['voucher_date', '凭证日期'], ['account_code', '科目编码'],
      ['supplier_name', '供应商名称'], ['invoice_no', '发票号码']
    ];
    (byType.required_fields || []).forEach(function (rule) {
      rows.forEach(function (row, index) {
        var missing = [];
        requiredFields.forEach(function (pair) {
          if (!text(row[pair[0]])) missing.push(pair[1]);
        });
        var amount = toNumber(row.amount);
        var debit = toNumber(row.debit);
        var credit = toNumber(row.credit);
        if (amount <= 0 && debit <= 0 && credit <= 0) missing.push('金额');
        if (missing.length) add(index, rule, '缺少必填字段：' + missing.join('、'));
      });
    });

    // R006 account compliance
    (byType.account_compliance || []).forEach(function (rule) {
      var allowed = text(rule.allowed_account_codes).replace(/，/g, ',').split(',')
        .map(function (item) { return item.trim(); }).filter(Boolean);
      if (!allowed.length) return;
      rows.forEach(function (row, index) {
        var account = text(row.account_code);
        if (!account) return;
        var ok = allowed.some(function (code) {
          return account === code || account.indexOf(code + '.') === 0;
        });
        if (!ok) {
          add(index, rule, '科目 ' + account + ' 不在允许清单内（允许：' + allowed.join(', ') + '）');
        }
      });
    });

    // R007/R008 expense limits
    (byType.expense_limit || []).forEach(function (rule) {
      var limit = toNumber(rule.threshold);
      if (limit <= 0) return;
      var targetType = text(rule.expense_type);
      rows.forEach(function (row, index) {
        var expenseType = text(row.expense_type);
        if (targetType && expenseType !== targetType) return;
        var amount = rowAmount(row);
        if (amount > limit) {
          add(index, rule, '费用类型 ' + (expenseType || '未分类') + ' 金额 ' + money(amount) +
            ' 超过限额 ' + money(limit));
        }
      });
    });

    // R009 supplier blacklist
    (byType.supplier_blacklist || []).forEach(function (rule) {
      var blacklist = (rule.blacklist_suppliers || []).map(text).filter(Boolean);
      if (!blacklist.length) return;
      rows.forEach(function (row, index) {
        var supplier = text(row.supplier_name);
        if (supplier && blacklist.some(function (name) {
          return supplier.indexOf(name) !== -1 || name.indexOf(supplier) !== -1;
        })) {
          add(index, rule, '供应商 ' + supplier + ' 在黑名单中');
        }
      });
    });

    // R010 approval level
    (byType.approval_level || []).forEach(function (rule) {
      var threshold = toNumber(rule.threshold);
      if (threshold <= 0) return;
      rows.forEach(function (row, index) {
        var amount = rowAmount(row);
        var level = Math.trunc(toNumber(row.approval_level || 0));
        if (amount > threshold && level < 2) {
          add(index, rule, '金额 ' + money(amount) + ' 超过 ' + money(threshold) +
            '，当前审批层级 ' + level + ' 不足（至少 2 级）');
        }
      });
    });

    return states.map(function (state) {
      return {
        result: state.has_error ? 'fail' : (state.has_warning ? 'warning' : 'pass'),
        anomaly_codes: state.codes.join(','),
        anomaly_detail: state.details.join('\n'),
        codes: state.codes,
        details: state.details
      };
    });
  }

  var HEADER_MAP = {
    '凭证号': 'voucher_no', '凭证编号': 'voucher_no', 'voucher_no': 'voucher_no',
    '凭证日期': 'voucher_date', 'voucher_date': 'voucher_date',
    '会计期间': 'period', '期间': 'period', 'period': 'period',
    '科目编码': 'account_code', '科目代码': 'account_code', 'account_code': 'account_code',
    '科目名称': 'account_name', 'account_name': 'account_name',
    '供应商名称': 'supplier_name', '供应商': 'supplier_name', 'supplier_name': 'supplier_name',
    '供应商税号': 'supplier_tax_id', '税号': 'supplier_tax_id', 'supplier_tax_id': 'supplier_tax_id',
    '发票号码': 'invoice_no', '发票号': 'invoice_no', 'invoice_no': 'invoice_no',
    '发票日期': 'invoice_date', 'invoice_date': 'invoice_date',
    '借方金额': 'debit', '借方': 'debit', 'debit': 'debit',
    '贷方金额': 'credit', '贷方': 'credit', 'credit': 'credit',
    '金额': 'amount', 'amount': 'amount',
    '费用类型': 'expense_type', 'expense_type': 'expense_type',
    '审批层级': 'approval_level', 'approval_level': 'approval_level',
    '摘要': 'description', '说明': 'description', 'description': 'description'
  };

  var TEMPLATE_HEADERS = [
    '凭证号', '凭证日期', '会计期间', '科目编码', '科目名称', '供应商名称', '供应商税号',
    '发票号码', '发票日期', '借方金额', '贷方金额', '金额', '费用类型', '审批层级', '摘要'
  ];

  function mapHeader(header) {
    var key = text(header);
    return HEADER_MAP[key] || HEADER_MAP[key.toLowerCase()] || null;
  }

  function recordsFromMatrix(matrix) {
    if (!matrix || !matrix.length) return { rows: [], mapping: {}, headers: [] };
    var headers = matrix[0].map(function (cell) { return text(cell); });
    var keys = headers.map(mapHeader);
    var mapping = {};
    keys.forEach(function (key, index) { if (key && !(key in mapping)) mapping[key] = index; });
    var rows = [];
    matrix.slice(1).forEach(function (raw) {
      if (!raw || !raw.some(function (value) { return text(value) !== ''; })) return;
      var record = {};
      raw.forEach(function (value, index) {
        var key = keys[index];
        if (!key) return;
        if (key === 'voucher_date' || key === 'invoice_date') record[key] = ymd(toDate(value));
        else if (key === 'debit' || key === 'credit' || key === 'amount') record[key] = toNumber(value);
        else if (key === 'approval_level') record[key] = Math.trunc(toNumber(value || 1)) || 1;
        else record[key] = text(value);
      });
      rows.push(record);
    });
    return { rows: rows, mapping: mapping, headers: headers };
  }

  function normalizeRows(rows) {
    return (rows || []).map(function (row) {
      var out = {};
      Object.keys(row || {}).forEach(function (key) {
        var value = row[key];
        if (key === 'voucher_date' || key === 'invoice_date') out[key] = ymd(toDate(value));
        else if (key === 'debit' || key === 'credit' || key === 'amount') out[key] = toNumber(value);
        else if (key === 'approval_level') out[key] = Math.trunc(toNumber(value || 1)) || 1;
        else out[key] = text(value);
      });
      return out;
    });
  }

  root.VoucherEngine = {
    DEFAULT_RULES: DEFAULT_RULES,
    HEADER_MAP: HEADER_MAP,
    TEMPLATE_HEADERS: TEMPLATE_HEADERS,
    defaultRules: defaultRules,
    validateRows: validateRows,
    recordsFromMatrix: recordsFromMatrix,
    normalizeRows: normalizeRows,
    toNumber: toNumber,
    toDate: toDate,
    ymd: ymd,
    money: money
  };
})(typeof window !== 'undefined' ? window : globalThis);
