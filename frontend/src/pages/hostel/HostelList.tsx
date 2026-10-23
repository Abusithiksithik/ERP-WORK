import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { FiEdit2, FiDollarSign, FiX, FiSearch, FiClock, FiCalendar, FiRefreshCw, FiTrash2, FiPlus, FiPrinter, FiDownload, FiSettings, FiCheck } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

interface HostelStudent {
  hostel_record_id: number;
  has_fee_schedule: boolean;
  student_id: number;
  student_code: string;
  full_name: string;
  mobile: string;
  course_name: string | null;
  batch_name: string | null;
  period_id: number | null;
  period_from: string | null;
  period_to: string | null;
  hostel_fee: number;
  mess_fee: number;
  total_fee: number;
  cumulative_total_fee: number;
  discount: number;
  paid_amount: number;
  period_paid_amount: number;
  period_last_payment_date: string | null;
  pending_balance: number;
  notes: string | null;
  joining_date: string | null;
  course_duration: string | null;
}

interface HostelPayment {
  id: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

interface HostelFeePeriod {
  period_id: number;
  period_from: string;
  period_to: string;
  hostel_fee: number;
  mess_fee: number;
  total_fee: number;
  discount: number;
  paid_amount: number;
  pending_balance: number;
  payment_count: number;
  is_deleted?: boolean;
}

interface HostelFeeRevision {
  id: number;
  effective_from: string;
  effective_to: string;
  previous_hostel_fee: number | null;
  previous_mess_fee: number | null;
  new_hostel_fee: number;
  new_mess_fee: number;
  notes: string | null;
  created_at: string;
  changed_by_name: string | null;
}

interface HostelHistory {
  active_schedule: { id: number; start_date: string; end_date: string; created_at: string } | null;
  summary: { months: number; total_fee: number; total_paid: number; total_pending: number };
  periods: HostelFeePeriod[];
  payments: (HostelPayment & { period_id: number | null; period_from: string | null; period_to: string | null })[];
  revisions: HostelFeeRevision[];
}

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? '0'));
  return Number.isNaN(n) ? 0 : n;
};

const fmt = (v: unknown): string =>
  '₹' + toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 0 });

const localISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthStartFor = (value: string) => `${value}-01`;
const monthEndFor = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${value}-${String(lastDay).padStart(2, '0')}`;
};
const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const academicStartYear = (d = new Date()) => d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
const academicYearOptions = () => {
  const current = academicStartYear();
  return Array.from({ length: Math.max(3, current - 2025 + 2) }, (_, i) => 2025 + i);
};
const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;
const monthsForAcademicYear = (startYear: number) => Array.from({ length: 12 }, (_, i) => {
  const monthDate = new Date(startYear, 3 + i, 1);
  return monthValue(monthDate);
});
const monthOptions = () => academicYearOptions().flatMap(year => monthsForAcademicYear(year));
const courseMonths = (value: string | null) => {
  const match = String(value || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(year|yr|month|mo)/);
  if (!match) return 12;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? (/year|yr/.test(match[2]) ? Math.round(amount * 12) : Math.round(amount)) : 12;
};
const addMonths = (date: string, amount: number) => {
  const [year, month] = date.slice(0, 10).split('-').map(Number);
  const d = new Date(year, month - 1 + amount, 1);
  return localISO(d);
};
const monthAfterDate = (date: string) => {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  return monthValue(new Date(year, month, 1));
};
const monthDifference = (start: string, endExclusive: string) => {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(endExclusive)) return 0;
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = endExclusive.split('-').map(Number);
  return Math.max(0, (ey * 12 + em) - (sy * 12 + sm));
};

const displayDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
};

const parseDDMMYYYY = (value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  label?: string;
}

const DateField: React.FC<DateFieldProps> = ({ value, onChange, min, max, required, label }) => {
  const [text, setText] = useState(displayDate(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(displayDate(value));
  }, [value]);

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      if ('showPicker' in picker) (picker as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      else (picker as HTMLInputElement & { click: () => void }).click();
    } catch {
      (picker as HTMLInputElement & { click: () => void }).click();
    }
  };

  return (
    <div className="hostel-date-field">
      <input
        type="text"
        className="form-control"
        value={text}
        placeholder="DD/MM/YYYY"
        inputMode="numeric"
        aria-label={label || 'Date'}
        required={required}
        onChange={e => {
          const next = e.target.value;
          setText(next);
          const iso = parseDDMMYYYY(next);
          if (iso) onChange(iso);
        }}
        onBlur={() => {
          const iso = parseDDMMYYYY(text);
          if (iso) {
            onChange(iso);
            setText(displayDate(iso));
          } else {
            setText(displayDate(value));
          }
        }}
      />
      <button type="button" className="hostel-date-picker-btn" onClick={openPicker} aria-label={`Open ${label || 'date'} calendar`}>
        <FiCalendar />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => onChange(e.target.value)}
        className="hostel-native-date-picker"
      />
    </div>
  );
};

const normalise = (row: Record<string, unknown>): HostelStudent => ({
  hostel_record_id: toNum(row.hostel_record_id),
  has_fee_schedule: Boolean(row.has_fee_schedule),
  student_id: toNum(row.student_id),
  student_code: String(row.student_code ?? ''),
  full_name: String(row.full_name ?? ''),
  mobile: String(row.mobile ?? ''),
  course_name: row.course_name ? String(row.course_name) : null,
  batch_name: row.batch_name ? String(row.batch_name) : null,
  period_id: row.period_id ? toNum(row.period_id) : null,
  period_from: row.period_from ? String(row.period_from) : null,
  period_to: row.period_to ? String(row.period_to) : null,
  hostel_fee: toNum(row.hostel_fee),
  mess_fee: toNum(row.mess_fee),
  total_fee: toNum(row.total_fee),
  cumulative_total_fee: toNum(row.cumulative_total_fee ?? row.total_fee),
  discount: toNum(row.discount),
  paid_amount: toNum(row.paid_amount),
  period_paid_amount: toNum(row.period_paid_amount),
  period_last_payment_date: row.period_last_payment_date ? String(row.period_last_payment_date).slice(0, 10) : null,
  pending_balance: toNum(row.pending_balance),
  notes: row.notes ? String(row.notes) : null,
  joining_date: row.joining_date ? String(row.joining_date).slice(0, 10) : null,
  course_duration: row.course_duration ? String(row.course_duration) : null,
});

const HostelList: React.FC = () => {
  const [students, setStudents] = useState<HostelStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hostelYear, setHostelYear] = useState(academicStartYear());
  const [periodMonth, setPeriodMonth] = useState(monthValue(new Date()));

  // Keep the selected month within the selected academic year (April–March).
  useEffect(() => {
    const validMonths = monthsForAcademicYear(hostelYear);
    if (!validMonths.includes(periodMonth)) setPeriodMonth(validMonths[0]);
  }, [hostelYear, periodMonth]);

  const periodFrom = monthStartFor(periodMonth);
  const periodTo = monthEndFor(periodMonth);

  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<HostelStudent | null>(null);
  const [feeForm, setFeeForm] = useState({ hostel_fee: '', mess_fee: '', start_date: '', end_date: '', notes: '' });
  const [savingFee, setSavingFee] = useState(false);
  const [feeSaveError, setFeeSaveError] = useState('');
  const [returnToHistory, setReturnToHistory] = useState(false);
  const [editPeriodsSnapshot, setEditPeriodsSnapshot] = useState<HostelFeePeriod[]>([]);
  const [feeMode, setFeeMode] = useState<'create' | 'revision'>('create');

  const [payModal, setPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState<HostelStudent | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: localISO(new Date()), payment_method: 'cash', reference: '', notes: '' });
  const [savingPay, setSavingPay] = useState(false);

  const [discountModal, setDiscountModal] = useState(false);
  const [discountTarget, setDiscountTarget] = useState<HostelStudent | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [savingDiscount, setSavingDiscount] = useState(false);

  const [historyModal, setHistoryModal] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<HostelStudent | null>(null);
  const [hostelHistory, setHostelHistory] = useState<HostelHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [savingMonthlyAction, setSavingMonthlyAction] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<HostelStudent | null>(null);
  const [receiptPaymentDate, setReceiptPaymentDate] = useState(localISO(new Date()));
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptStaff, setReceiptStaff] = useState('');
  const [staffSettingsOpen, setStaffSettingsOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState('');
  const [seniorStaff, setSeniorStaff] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hostel_senior_staff') || '[]'); } catch { return []; } });



  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { period_month: periodMonth };
      if (search.trim()) params.search = search.trim();
      const r = await api.get('/hostel', { params });
      setStudents((r.data.data || []).map((row: Record<string, unknown>) => normalise(row)));
    } catch {
      toast.error('Failed to load hostel students');
    } finally {
      setLoading(false);
    }
  }, [periodMonth, search]);

  useEffect(() => { load(); }, [load]);

  const totalStudents = students.length;
  const totalFee = useMemo(() => students.reduce((s, r) => s + r.cumulative_total_fee, 0), [students]);
  const tillMonthLabel = useMemo(() => { const [year, month] = periodMonth.split('-').map(Number); return `${new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long' })} ${year}`; }, [periodMonth]);
  const totalPaid = useMemo(() => students.reduce((s, r) => s + r.paid_amount, 0), [students]);
  const totalPending = useMemo(() => students.reduce((s, r) => s + r.pending_balance, 0), [students]);

  const openEdit = async (s: HostelStudent) => {
    setReturnToHistory(false);
    setFeeSaveError('');
    setEditTarget(s);
    if (s.has_fee_schedule) {
      // Edit opens the fee editor directly; Payment History remains a separate action.
      try {
        const response = await api.get(`/hostel/${s.hostel_record_id}/history`);
        const data = response.data?.data || {};
        const schedule = data.active_schedule;
        const rawPeriods = (data.periods || []) as Record<string, unknown>[];
        const periods = rawPeriods.map(p => ({
          period_id: toNum(p.period_id), period_from: String(p.period_from || ''), period_to: String(p.period_to || ''),
          hostel_fee: toNum(p.hostel_fee), mess_fee: toNum(p.mess_fee), total_fee: toNum(p.total_fee), discount: toNum(p.discount),
          paid_amount: toNum(p.paid_amount), pending_balance: toNum(p.pending_balance), payment_count: toNum(p.payment_count),
        } as HostelFeePeriod));
        setEditPeriodsSnapshot(periods);
        if (!schedule) {
          setEditPeriodsSnapshot([]);
          toast.info('No active fee schedule exists. Create a new schedule.');
          setFeeMode('create');
          const joiningMonth = monthValue(new Date(`${(s.joining_date || periodFrom).slice(0, 10)}T00:00:00`));
          const endMonth = monthValue(new Date(`${addMonths(s.joining_date || periodFrom, courseMonths(s.course_duration))}T00:00:00`));
          setFeeForm({ hostel_fee: String(s.hostel_fee || 0), mess_fee: String(s.mess_fee || 0), start_date: joiningMonth, end_date: endMonth, notes: s.notes ?? '' });
        } else {
          setEditTarget({ ...s, period_from: String(schedule.start_date || s.period_from || '') });
          const startMonth = monthValue(new Date(`${String(schedule.start_date).slice(0, 10)}T00:00:00`));
          const endMonth = monthAfterDate(String(schedule.end_date)); // fixed exclusive end month
          const ordered = [...periods].sort((a, b) => String(a.period_from).localeCompare(String(b.period_from)));
          const firstUnpaid = ordered.find(p => toNum(p.paid_amount) === 0 && toNum(p.pending_balance) > 0);
          const paid = ordered.filter(p => toNum(p.paid_amount) > 0);
          const defaultEffective = firstUnpaid
            ? monthValue(new Date(`${String(firstUnpaid.period_from).slice(0, 10)}T00:00:00`))
            : paid.length ? monthAfterDate(String(paid[paid.length - 1].period_from)) : startMonth;
          const effective = defaultEffective < startMonth ? startMonth : defaultEffective >= endMonth ? startMonth : defaultEffective;
          const currentRate = ordered.find(p => String(p.period_from).slice(0, 7) === effective) || ordered[ordered.length - 1];
          setFeeMode('revision');
          setFeeForm({
            hostel_fee: String(toNum(currentRate?.hostel_fee ?? s.hostel_fee)),
            mess_fee: String(toNum(currentRate?.mess_fee ?? s.mess_fee)),
            start_date: effective,
            end_date: endMonth,
            notes: '',
          });
        }
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Could not load this student fee schedule');
        return;
      }
    } else {
      setEditPeriodsSnapshot([]);
      setFeeMode('create');
      const joiningDate = s.joining_date || periodFrom;
      const joiningMonth = monthValue(new Date(`${joiningDate.slice(0, 10)}T00:00:00`));
      const courseEndMonth = monthValue(new Date(`${addMonths(joiningDate, courseMonths(s.course_duration))}T00:00:00`));
      setFeeForm({
        hostel_fee: String(s.hostel_fee || 0),
        mess_fee: String(s.mess_fee || 0),
        start_date: joiningMonth,
        end_date: courseEndMonth > joiningMonth ? courseEndMonth : monthAfterDate(periodTo),
        notes: s.notes ?? '',
      });
    }
    setEditModal(true);
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const hf = parseFloat(feeForm.hostel_fee);
    const mf = parseFloat(feeForm.mess_fee);
    if (!Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0) {
      toast.error('Enter valid hostel and mess fees');
      return;
    }
    if (!feeForm.start_date || !feeForm.end_date || feeForm.start_date > feeForm.end_date) {
      toast.error('Choose a valid start date and end date');
      return;
    }
    if (feeForm.start_date < '2025-01' || feeForm.end_date > '2030-12') {
      toast.error('Fee dates must be between January 2025 and December 2030');
      return;
    }
    setSavingFee(true);
    setFeeSaveError('');
    try {
      const endpoint = feeMode === 'revision'
        ? `/hostel/${editTarget.hostel_record_id}/revision`
        : `/hostel/${editTarget.hostel_record_id}`;
      await api.put(endpoint, {
        hostel_fee: hf, mess_fee: mf, period_from: `${feeForm.start_date}-01`, period_to: `${feeForm.end_date}-01`, notes: feeForm.notes || null,
      });
      toast.success(feeMode === 'revision' ? 'Future monthly fees updated successfully' : 'Fee schedule created successfully');
      setEditModal(false);
      if (returnToHistory) {
        setReturnToHistory(false);
        await openHistory(editTarget);
      }
      await load();
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to update fees';
      setFeeSaveError(message);
      toast.error(message);
    } finally { setSavingFee(false); }
  };

  const openPay = (s: HostelStudent) => {
    if (!s.period_id) {
      toast.error('Set the hostel fee period first');
      return;
    }
    setPayTarget(s);
    setPayForm({ amount: '', payment_date: localISO(new Date()), payment_method: 'cash', reference: '', notes: '' });
    setPayModal(true);
  };

  const handleSavePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || !payTarget.period_id) return;
    const amt = parseFloat(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid amount greater than 0'); return; }
    setSavingPay(true);
    try {
      await api.post(`/hostel/${payTarget.hostel_record_id}/payments`, {
        amount: amt,
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        reference: payForm.reference || null,
        notes: payForm.notes || null,
        period_id: payTarget.period_id,
      });
      toast.success('Payment recorded successfully');
      setPayModal(false);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally { setSavingPay(false); }
  };

  const openDiscount = (s: HostelStudent) => {
    if (!s.period_id) {
      toast.error('Set the hostel fee period first');
      return;
    }
    setDiscountTarget(s);
    setDiscountAmount(s.discount ? String(s.discount) : '');
    setDiscountModal(true);
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountTarget || !discountTarget.period_id) return;
    const amt = parseFloat(discountAmount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error('Enter a valid discount amount'); return; }
    setSavingDiscount(true);
    try {
      await api.post(`/hostel/${discountTarget.hostel_record_id}/discount`, { discount: amt, period_id: discountTarget.period_id });
      toast.success('Discount applied!');
      setDiscountModal(false);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply discount');
    } finally { setSavingDiscount(false); }
  };

  const openHistory = async (s: HostelStudent) => {
    setHistoryTarget(s);
    setHistoryModal(true);
    setHostelHistory(null);
    setLoadingHistory(true);
    try {
      const r = await api.get(`/hostel/${s.hostel_record_id}/history`);
      const data = r.data.data || {};
      setHostelHistory({
        active_schedule: data.active_schedule ? {
          id: toNum(data.active_schedule.id), start_date: String(data.active_schedule.start_date || ''),
          end_date: String(data.active_schedule.end_date || ''), created_at: String(data.active_schedule.created_at || ''),
        } : null,
        summary: {
          months: toNum(data.summary?.months),
          total_fee: toNum(data.summary?.total_fee),
          total_paid: toNum(data.summary?.total_paid),
          total_pending: toNum(data.summary?.total_pending),
        },
        periods: (data.periods || []).map((p: Record<string, unknown>) => ({
          period_id: toNum(p.period_id), period_from: String(p.period_from || ''), period_to: String(p.period_to || ''),
          hostel_fee: toNum(p.hostel_fee), mess_fee: toNum(p.mess_fee), total_fee: toNum(p.total_fee),
          discount: toNum(p.discount), paid_amount: toNum(p.paid_amount), pending_balance: toNum(p.pending_balance),
          payment_count: toNum(p.payment_count), is_deleted: Boolean(p.is_deleted),
        })),
        payments: (data.payments || []).map((p: Record<string, unknown>) => ({
          id: toNum(p.id), amount: toNum(p.amount), payment_date: String(p.payment_date || ''),
          payment_method: String(p.payment_method || 'cash'), reference: p.reference ? String(p.reference) : null,
          notes: p.notes ? String(p.notes) : null, recorded_by_name: p.recorded_by_name ? String(p.recorded_by_name) : null,
          created_at: String(p.created_at || ''), period_id: p.period_id ? toNum(p.period_id) : null,
          period_from: p.period_from ? String(p.period_from) : null, period_to: p.period_to ? String(p.period_to) : null,
        })),
        revisions: (data.revisions || []).map((r: Record<string, unknown>) => ({
          id: toNum(r.id), effective_from: String(r.effective_from || ''), effective_to: String(r.effective_to || ''),
          previous_hostel_fee: r.previous_hostel_fee == null ? null : toNum(r.previous_hostel_fee),
          previous_mess_fee: r.previous_mess_fee == null ? null : toNum(r.previous_mess_fee),
          new_hostel_fee: toNum(r.new_hostel_fee), new_mess_fee: toNum(r.new_mess_fee),
          notes: r.notes ? String(r.notes) : null, created_at: String(r.created_at || ''),
          changed_by_name: r.changed_by_name ? String(r.changed_by_name) : null,
        })),
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load hostel fee history');
    } finally { setLoadingHistory(false); }
  };


  const startRevision = () => {
    if (!historyTarget || !hostelHistory) return;
    const periods = hostelHistory.periods;
    if (!periods.length && !hostelHistory.active_schedule) {
      toast.info('Create a fee schedule first.');
      return;
    }
    const lastPeriod = periods[periods.length - 1];
    const fixedEndMonth = monthAfterDate(hostelHistory.active_schedule?.end_date || lastPeriod?.period_to || '');
    const scheduleStartMonth = hostelHistory.active_schedule?.start_date
      ? monthValue(new Date(`${hostelHistory.active_schedule.start_date}T00:00:00`))
      : periods[0]?.period_from
        ? monthValue(new Date(`${periods[0].period_from}T00:00:00`))
        : periodMonth;
    const paidPeriods = periods.filter(p => p.paid_amount > 0).sort((a, b) => a.period_from.localeCompare(b.period_from));
    const lastPaid = paidPeriods[paidPeriods.length - 1];
    const nextMonthAfterLastPaid = (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      date.setMonth(date.getMonth() + 1, 1);
      return monthStartFor(monthValue(date));
    };
    const firstUnpaid = periods.find(p => p.pending_balance > 0 && p.paid_amount === 0);
    const effective = lastPaid ? nextMonthAfterLastPaid(lastPaid.period_from) : (firstUnpaid?.period_from || `${scheduleStartMonth}-01`);
    if (monthValue(new Date(`${effective}T00:00:00`)) >= fixedEndMonth) {
      toast.info('There are no future months left to revise in this fee schedule.');
      return;
    }
    setEditTarget({ ...historyTarget, period_from: hostelHistory.active_schedule?.start_date || historyTarget.period_from });
    setEditPeriodsSnapshot(periods);
    setReturnToHistory(true);
    setHistoryModal(false);
    setFeeMode('revision');
    setFeeSaveError('');
    setFeeForm({
      hostel_fee: String(lastPeriod?.hostel_fee ?? historyTarget.hostel_fee ?? 0),
      mess_fee: String(lastPeriod?.mess_fee ?? historyTarget.mess_fee ?? 0),
      start_date: monthValue(new Date(`${effective}T00:00:00`)),
      end_date: fixedEndMonth,
      notes: '',
    });
    setEditModal(true);
  };

  const startNewScheduleFromHistory = () => {
    if (!historyTarget) return;
    setReturnToHistory(false);
    setEditPeriodsSnapshot([]);
    const joiningDate = historyTarget.joining_date || periodFrom;
    const courseEnd = addMonths(joiningDate, courseMonths(historyTarget.course_duration));
    const lastPeriod = hostelHistory?.periods[hostelHistory.periods.length - 1];
    setEditTarget({ ...historyTarget, period_id: null });
    setFeeMode('create');
    setFeeSaveError('');
    setFeeForm({
      hostel_fee: String(lastPeriod?.hostel_fee ?? historyTarget.hostel_fee ?? 0),
      mess_fee: String(lastPeriod?.mess_fee ?? historyTarget.mess_fee ?? 0),
      start_date: monthValue(new Date(`${joiningDate.slice(0, 10)}T00:00:00`)),
      end_date: monthValue(new Date(`${courseEnd.slice(0, 10)}T00:00:00`)),
      notes: '',
    });
    setHistoryModal(false);
    setEditModal(true);
  };

  const deleteMonthlyFee = async (period: HostelFeePeriod) => {
    if (!historyTarget || period.is_deleted || savingMonthlyAction) return;
    const month = monthLabel(monthValue(new Date(`${period.period_from}T00:00:00`)));
    if (!window.confirm(`Delete ${month} fee from calculations? Payment transaction history will be preserved.`)) return;
    setSavingMonthlyAction(true);
    try {
      await api.delete(`/hostel/${historyTarget.hostel_record_id}/history/periods/${period.period_id}`);
      toast.success(`${month} fee deleted.`);
      await openHistory(historyTarget);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete monthly fee');
    } finally { setSavingMonthlyAction(false); }
  };

  const restoreMonthlyFee = async (period: HostelFeePeriod) => {
    if (!historyTarget || !period.is_deleted || savingMonthlyAction) return;
    const previous = hostelHistory?.periods.filter(p => !p.is_deleted && p.period_from < period.period_from).slice(-1)[0];
    const hostelRaw = window.prompt('Hostel fee for this month (₹):', String(previous?.hostel_fee ?? historyTarget.hostel_fee ?? 0));
    if (hostelRaw === null) return;
    const messRaw = window.prompt('Mess fee for this month (₹):', String(previous?.mess_fee ?? historyTarget.mess_fee ?? 0));
    if (messRaw === null) return;
    const hostelFee = Number(hostelRaw), messFee = Number(messRaw);
    if (!Number.isFinite(hostelFee) || !Number.isFinite(messFee) || hostelFee < 0 || messFee < 0) {
      toast.error('Enter valid non-negative hostel and mess fees.'); return;
    }
    setSavingMonthlyAction(true);
    try {
      await api.post(`/hostel/${historyTarget.hostel_record_id}/history/periods/${period.period_id}/restore`, { hostel_fee: hostelFee, mess_fee: messFee });
      toast.success('Monthly fee added back.');
      await openHistory(historyTarget);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add monthly fee');
    } finally { setSavingMonthlyAction(false); }
  };

  const deleteFeeSchedule = async () => {
    if (!historyTarget) return;
    const confirmed = window.confirm(
      `Permanently delete ALL hostel fee data for ${historyTarget.full_name} (${historyTarget.student_code})? This removes every hostel fee period, fee schedule, fee revision, and hostel payment transaction for this student. This cannot be undone.`
    );
    if (!confirmed || deletingHistory) return;
    setDeletingHistory(true);
    try {
      const response = await api.delete(`/hostel/${historyTarget.hostel_record_id}/history`);
      const removed = response.data?.data || {};
      // Update the open modal immediately instead of issuing another history GET
      // for data that the server has just confirmed was deleted.
      setHostelHistory({
        active_schedule: null,
        summary: { months: 0, total_fee: 0, total_paid: 0, total_pending: 0 },
        periods: [], payments: [], revisions: [],
      });
      toast.success(`Hostel fee history cleared. ${toNum(removed.periods_removed)} periods and ${toNum(removed.payments_removed)} payments deleted.`);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to clear hostel fee history');
    } finally {
      setDeletingHistory(false);
    }
  };

  const openReceipt = (student: HostelStudent) => {
    const periodTotal = Math.max(0, student.total_fee - student.discount);
    if (!student.period_id || periodTotal <= 0 || student.period_paid_amount < periodTotal) {
      toast.info('Receipt is available only after this month’s hostel and mess fees are fully paid.');
      return;
    }
    setReceiptTarget(student);
    setReceiptAmount(String(periodTotal));
    setReceiptPaymentDate(student.period_last_payment_date || localISO(new Date()));
    setReceiptStaff(seniorStaff[0] || '');
  };
  const saveSeniorStaff = () => {
    const names = [...new Set(staffDraft.split(/\n|,/).map(n => n.trim()).filter(Boolean))];
    setSeniorStaff(names);
    localStorage.setItem('hostel_senior_staff', JSON.stringify(names));
    setStaffSettingsOpen(false);
    toast.success('Senior staff list saved on this browser');
  };
  const printReceipt = () => window.print();
  const downloadReceipt = () => {
    if (!receiptTarget) return;
    const html = document.getElementById('hostel-receipt-print')?.outerHTML;
    if (!html) return;
    const blob = new Blob([`<!doctype html><html><head><meta charset=\"utf-8\"><title>Nalam Trust Receipt</title><style>body{font-family:Georgia,serif;padding:25px;color:#172554}.receipt{border:3px double #283c75;padding:28px;max-width:850px;margin:auto;min-height:360px}.brand{text-align:center;font-size:30px;font-weight:bold;letter-spacing:1px}.label{text-align:center;background:#283c75;color:white;width:max-content;margin:8px auto;padding:5px 18px;font-weight:bold}.line{margin:24px 0;border-bottom:1px dotted #333;padding:8px 0}.amount{border:1px solid #283c75;padding:12px;font-size:22px;font-weight:bold;width:180px}.handover{text-align:right;margin-top:40px}</style></head><body>${html}</body></html>`], {type:'text/html'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`Receipt-${receiptTarget.student_code}-${periodMonth}.html`; a.click(); URL.revokeObjectURL(url);
  };

  const previewTotal = (parseFloat(feeForm.hostel_fee) || 0) + (parseFloat(feeForm.mess_fee) || 0);
  const previewPending = Math.max(0, previewTotal - (editTarget?.discount || 0) - (editTarget?.paid_amount || 0));
  const previewMonths = monthDifference(feeForm.start_date, feeForm.end_date);
  const previewRangeTotal = previewTotal * previewMonths;
  const uniqueEditPeriods = useMemo(() => {
    const byMonth = new Map<string, HostelFeePeriod>();
    for (const period of editPeriodsSnapshot) {
      const month = String(period.period_from || '').slice(0, 7);
      const prior = byMonth.get(month);
      if (!prior || period.period_id > prior.period_id) byMonth.set(month, period);
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, period]) => period);
  }, [editPeriodsSnapshot]);
  const currentScheduleTotal = uniqueEditPeriods.reduce((sum, period) => sum + Math.max(0, period.total_fee - period.discount), 0);
  const replacedFutureTotal = feeMode === 'revision'
    ? uniqueEditPeriods.filter(period => String(period.period_from).slice(0, 7) >= feeForm.start_date && String(period.period_from).slice(0, 7) < feeForm.end_date)
      .reduce((sum, period) => sum + Math.max(0, period.total_fee - period.discount), 0)
    : 0;
  const previewCourseTotal = feeMode === 'revision'
    ? Math.max(0, currentScheduleTotal - replacedFutureTotal + previewRangeTotal)
    : previewRangeTotal;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏠 Hostel Management</h1>
          <p className="page-subtitle">Candidates staying in hostel — monthly fee tracking &amp; payments</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => { setStaffDraft(seniorStaff.join('\n')); setStaffSettingsOpen(true); }}><FiSettings style={{ marginRight: 6 }} /> Senior Staff</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Hostel Students', value: String(totalStudents), icon: '🏠', color: 'var(--accent)' },
          { label: 'Total Fee', value: fmt(totalFee), subLabel: `Till ${tillMonthLabel}`, icon: '💰', color: '#f59e0b' },
          { label: 'Total Paid', value: fmt(totalPaid), subLabel: `Till ${tillMonthLabel}`, icon: '✅', color: '#10b981' },
          { label: 'Total Pending', value: fmt(totalPending), subLabel: `Till ${tillMonthLabel}`, icon: '⏳', color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28 }}>{stat.icon}</div><div>
              <div style={{ fontSize: stat.label === 'Hostel Students' ? 22 : 16, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{stat.label}</div>{'subLabel' in stat && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{stat.subLabel}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label className="form-label">Academic Year</label>
            <select className="form-control" value={hostelYear} onChange={e => { const year = Number(e.target.value); setHostelYear(year); setPeriodMonth(`${year}-04`); }}>
              {academicYearOptions().map(year => <option key={year} value={year}>{academicYearLabel(year)}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 220 }}>
            <label className="form-label">Month</label>
            <select className="form-control" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)}>
              {monthsForAcademicYear(hostelYear).map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
            </select>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingBottom: 10, flex: 1 }}>
            Period: <strong>{monthLabel(periodMonth)}</strong> ({displayDate(periodFrom)} → {displayDate(periodTo)})
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading} title="Refresh hostel data" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>
            <FiRefreshCw style={{ marginRight: 6, verticalAlign: 'middle' }} /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="search-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="search-input-wrap" style={{ flex: 1, minWidth: 200 }}>
            <FiSearch className="search-icon" />
            <input className="form-control search-input" placeholder="Search by name, student ID, mobile..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div> : students.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🏠</div><h3>No Hostel Students</h3><p>Candidates whose Accommodation Type is set to "Hostel" will appear here automatically.</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Candidate</th><th>Course / Batch</th><th>Hostel Fee</th><th>Mess Fee</th><th>Total Fee</th><th>Paid</th><th>Pending</th><th>Actions</th></tr></thead>
              <tbody>{students.map(s => {
                const cleared = s.pending_balance <= 0;
                return <tr key={s.hostel_record_id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏠</div><div><div style={{ fontWeight: 700 }}>{s.full_name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.student_code}</div></div></div></td>
                  <td><div style={{ fontSize: 13 }}>{s.course_name || '—'}</div>{s.batch_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.batch_name}</div>}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.hostel_fee)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.mess_fee)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.discount > 0 ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: 2 }}>{fmt(s.total_fee)}</div><span>{fmt(Math.max(0, s.total_fee - s.discount))}</span></div> : fmt(s.total_fee)}</td>
                  <td style={{ fontWeight: 600, color: '#10b981' }}>{fmt(s.paid_amount)}</td>
                  <td><span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: cleared ? '#10b981' : '#ef4444', background: cleared ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>{cleared ? '✓ Cleared' : fmt(s.pending_balance)}</span></td>
                  <td><div className="table-actions">
                    <button className="action-btn edit" title="Edit Fees" onClick={() => openEdit(s)}><FiEdit2 /></button>
                    <button className="action-btn" title="Record Payment" style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openPay(s)}><FiDollarSign /></button>
                    <button className="action-btn" title="Discount" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openDiscount(s)}>🏷️</button>
                    <button className="action-btn" title="Payment History" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openHistory(s)}><FiClock /></button>
                    {s.period_id && s.total_fee - s.discount > 0 && s.period_paid_amount >= Math.max(0, s.total_fee - s.discount) && <button className="action-btn" title="Generate monthly receipt" style={{ color: '#10b981', background: 'rgba(16,185,129,0.12)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openReceipt(s)}><FiPrinter /></button>}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && editTarget && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header"><h2 className="modal-title">{feeMode === 'revision' ? '✏️ Edit Future Hostel Fees' : '🧾 Create Hostel Fee Schedule'}</h2><button className="modal-close" onClick={() => setEditModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}><div style={{ fontWeight: 700 }}>{editTarget.full_name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{editTarget.student_code}</div></div>
        <form onSubmit={handleSaveFee}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{feeMode === 'revision' ? 'Choose the month from which the new monthly rates start. The course end month is fixed and cannot be changed. Paid months remain unchanged.' : 'Create one schedule for this student. The selected end month is exclusive: October 2026 to October 2027 creates 12 monthly charges (October through September).'}</p>
          {feeSaveError && <div role="alert" style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', fontSize: 13 }}>{feeSaveError}</div>}
          <div className="form-grid">
            <div className="form-group"><label className="form-label">{feeMode === 'revision' ? 'Fee Increase From (Month) *' : 'Start Month *'}</label><input type="month" className="form-control" min={feeMode === 'revision' && editTarget?.period_from ? editTarget.period_from.slice(0, 7) : '2025-01'} max={feeForm.end_date || '2030-12'} value={feeForm.start_date} onChange={e => setFeeForm(f => ({ ...f, start_date: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Course End Month (exclusive) *</label><input type="month" className="form-control" min={feeForm.start_date || '2025-01'} max="2030-12" value={feeForm.end_date} onChange={e => setFeeForm(f => ({ ...f, end_date: e.target.value }))} disabled={feeMode === 'revision'} required /></div>
            <div className="form-group"><label className="form-label">Hostel Fee (₹ / month)</label><input type="number" className="form-control" min="0" step="any" value={feeForm.hostel_fee} onChange={e => setFeeForm(f => ({ ...f, hostel_fee: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Mess Fee (₹ / month)</label><input type="number" className="form-control" min="0" step="any" value={feeForm.mess_fee} onChange={e => setFeeForm(f => ({ ...f, mess_fee: e.target.value }))} required /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={feeForm.notes} onChange={e => setFeeForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.07)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Months in selected range</span><strong>{previewMonths}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Monthly Total</span><strong>{fmt(previewTotal)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Fee for selected months</span><strong>{fmt(previewRangeTotal)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--border-light)', paddingTop: 7, marginTop: 4 }}><span>Total Course Fee After Update</span><strong>{fmt(previewCourseTotal)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}><span>Current selected month pending (estimate)</span><span style={{ color: previewPending > 0 ? '#ef4444' : '#10b981' }}>{previewPending <= 0 ? '✓ Cleared' : fmt(previewPending)}</span></div></div>
          <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingFee}>{savingFee ? 'Saving...' : feeMode === 'revision' ? 'Update Schedule' : 'Create Schedule'}</button><button type="button" className="btn btn-secondary" onClick={() => setEditModal(false)}>Cancel</button></div>
        </form>
      </div></div>}

      {payModal && payTarget && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header"><h2 className="modal-title">💵 Add Payment</h2><button className="modal-close" onClick={() => setPayModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(16,185,129,0.07)', borderRadius: 8 }}><div style={{ fontWeight: 700, marginBottom: 6 }}>{payTarget.full_name} — {payTarget.student_code}</div><div style={{ fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}><span>Period: <strong>{displayDate(payTarget.period_from)} - {displayDate(payTarget.period_to)}</strong></span><span>Total: <strong>{fmt(payTarget.total_fee)}</strong></span><span>Paid: <strong style={{ color: '#10b981' }}>{fmt(payTarget.paid_amount)}</strong></span><span>Pending: <strong style={{ color: payTarget.pending_balance > 0 ? '#ef4444' : '#10b981' }}>{payTarget.pending_balance <= 0 ? '✓ Cleared' : fmt(payTarget.pending_balance)}</strong></span></div></div>
        <form onSubmit={handleSavePay}><div className="form-grid">
          <div className="form-group"><label className="form-label">Amount (₹) *</label><input type="number" className="form-control" min="1" step="any" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Payment Date *</label><input type="date" className="form-control" value={payForm.payment_date} max={localISO(new Date())} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Payment Method</label><select className="form-control" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option></select></div>
          <div className="form-group"><label className="form-label">Reference</label><input className="form-control" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div><div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingPay}>{savingPay ? 'Recording...' : 'Record Payment'}</button><button type="button" className="btn btn-secondary" onClick={() => setPayModal(false)}>Cancel</button></div></form>
      </div></div>}

      {discountModal && discountTarget && <div className="modal-overlay" onClick={() => setDiscountModal(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h2 className="modal-title">🏷️ Apply Discount</h2><button className="modal-close" onClick={() => setDiscountModal(false)}><FiX /></button></div>
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(245,158,11,0.07)', borderRadius: 8 }}><div style={{ fontWeight: 700, marginBottom: 6 }}>{discountTarget.full_name} — {discountTarget.student_code}</div><div style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}><span>Period: <strong>{displayDate(discountTarget.period_from)} - {displayDate(discountTarget.period_to)}</strong></span><span>Actual: <strong>{fmt(discountTarget.total_fee)}</strong></span><span>Discount: <strong style={{ color: '#f59e0b' }}>{fmt(discountTarget.discount)}</strong></span><span>Pending: <strong>{fmt(discountTarget.pending_balance)}</strong></span></div></div>
        <form onSubmit={handleSaveDiscount}><div className="form-group"><label className="form-label">Discount Amount (₹) *</label><input type="number" className="form-control" min="0" step="any" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} required />{Number(discountAmount) > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Final Fee: <strong style={{ color: 'var(--teal)' }}>{fmt(Math.max(0, discountTarget.total_fee - Number(discountAmount)))}</strong> · Pending: <strong>{fmt(Math.max(0, discountTarget.total_fee - Number(discountAmount) - discountTarget.paid_amount))}</strong></p>}</div><div className="form-actions"><button type="submit" className="btn btn-primary" disabled={savingDiscount}>{savingDiscount ? 'Applying...' : '✓ Apply Discount'}</button><button type="button" className="btn btn-secondary" onClick={() => setDiscountModal(false)}>Cancel</button></div></form>
      </div></div>}

      {historyModal && historyTarget && <div className="modal-overlay" onClick={() => setHistoryModal(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1040, width: 'min(1040px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header"><h2 className="modal-title">📋 Student Hostel Fee &amp; Payment History</h2><button className="modal-close" onClick={() => setHistoryModal(false)}><FiX /></button></div>
        {!loadingHistory && hostelHistory && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, flexShrink: 0 }}>
          {hostelHistory.active_schedule && <button className="btn btn-primary" type="button" onClick={startRevision}>✏️ Edit Future Fees</button>}
          {!hostelHistory.active_schedule && <button className="btn btn-primary" type="button" onClick={startNewScheduleFromHistory}>Create New Fee Schedule</button>}
          {(hostelHistory.active_schedule || hostelHistory.periods.length > 0 || hostelHistory.payments.length > 0 || hostelHistory.revisions.length > 0) && <button className="btn btn-danger" type="button" onClick={deleteFeeSchedule} disabled={deletingHistory}>{deletingHistory ? 'Deleting...' : 'Delete All Fee & Payment History'}</button>}
        </div>}
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, flexShrink: 0 }}><div style={{ fontWeight: 700 }}>{historyTarget.full_name} — {historyTarget.student_code}</div><div style={{ fontSize: 12, marginTop: 4 }}>Course: <strong>{historyTarget.course_name || '—'}</strong> · Joining: <strong>{displayDate(historyTarget.joining_date)}</strong>{hostelHistory?.active_schedule && <> · Schedule: <strong>{monthLabel(monthValue(new Date(`${hostelHistory.active_schedule.start_date}T00:00:00`)))} – {monthLabel(monthAfterDate(hostelHistory.active_schedule.end_date))}</strong></>} · Fee periods: <strong>{hostelHistory?.summary.months ?? '—'} months</strong></div></div>
        {loadingHistory ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading complete history...</div> : !hostelHistory ? <div className="empty-state" style={{ padding: 30 }}>History could not be loaded.</div> : <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[{ label: 'Total Scheduled Fee', value: fmt(hostelHistory.summary.total_fee), color: '#f59e0b' }, { label: 'Total Paid', value: fmt(hostelHistory.summary.total_paid), color: '#10b981' }, { label: 'Remaining Balance', value: fmt(hostelHistory.summary.total_pending), color: hostelHistory.summary.total_pending > 0 ? '#ef4444' : '#10b981' }].map(card => <div key={card.label} style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-secondary, rgba(255,255,255,0.04))', border: '1px solid var(--border-light)' }}><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{card.label}</div><div style={{ fontSize: 18, fontWeight: 800, color: card.color }}>{card.value}</div></div>)}
          </div>
          <h3 style={{ fontSize: 14, margin: '4px 0 8px' }}>Monthly Fee Schedule</h3>
          {hostelHistory.periods.length === 0 ? <div className="empty-state" style={{ padding: 18 }}>No fee periods saved yet.</div> : <div className="table-container" style={{ maxHeight: 280, overflow: 'auto', marginBottom: 18 }}><table><thead><tr><th>Month / Period</th><th>Hostel</th><th>Mess</th><th>Total Fee</th><th>Paid</th><th>Pending</th><th>Status</th><th>Action</th></tr></thead><tbody>{hostelHistory.periods.map(period => { const month = monthLabel(monthValue(new Date(`${period.period_from}T00:00:00`))); const cleared = period.pending_balance <= 0; const deleted = Boolean(period.is_deleted); return <tr key={period.period_id} style={deleted ? { opacity: 0.72 } : undefined}><td><strong>{month}</strong><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{displayDate(period.period_from)} – {displayDate(period.period_to)}</div></td><td>{fmt(deleted ? 0 : period.hostel_fee)}</td><td>{fmt(deleted ? 0 : period.mess_fee)}</td><td style={{ fontWeight: 700 }}>{fmt(deleted ? 0 : Math.max(0, period.total_fee - period.discount))}</td><td style={{ color: '#10b981', fontWeight: 700 }}>{fmt(deleted ? 0 : period.paid_amount)}</td><td style={{ color: !deleted && period.pending_balance > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{fmt(deleted ? 0 : period.pending_balance)}</td><td><span style={{ color: deleted ? '#94a3b8' : cleared ? '#10b981' : period.paid_amount > 0 ? '#f59e0b' : '#ef4444', fontSize: 11, fontWeight: 700 }}>{deleted ? 'DELETED' : cleared ? 'PAID' : period.paid_amount > 0 ? 'PARTIAL' : 'PENDING'}</span></td><td>{deleted ? <button type="button" className="btn btn-primary" style={{ padding: '5px 8px', fontSize: 11 }} disabled={savingMonthlyAction} onClick={() => restoreMonthlyFee(period)}><FiPlus /> Add New</button> : <button type="button" className="btn btn-danger" style={{ padding: '5px 8px', fontSize: 11 }} disabled={savingMonthlyAction} title={`Delete ${month}`} onClick={() => deleteMonthlyFee(period)}><FiTrash2 /></button>}</td></tr>; })}</tbody></table></div>}
          <h3 style={{ fontSize: 14, margin: '4px 0 8px' }}>Fee Change History</h3>
          {hostelHistory.revisions.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0 14px' }}>No fee revisions recorded by the new history tracker yet. Existing monthly rates remain visible above.</div> : <div className="table-container" style={{ maxHeight: 180, overflow: 'auto', marginBottom: 18 }}><table><thead><tr><th>Effective From</th><th>Effective To</th><th>Previous Monthly Total</th><th>New Monthly Total</th><th>Changed By</th><th>Notes</th></tr></thead><tbody>{hostelHistory.revisions.map(rev => <tr key={rev.id}><td>{displayDate(rev.effective_from)}</td><td>{displayDate(rev.effective_to)}</td><td>{rev.previous_hostel_fee == null || rev.previous_mess_fee == null ? '—' : fmt(rev.previous_hostel_fee + rev.previous_mess_fee)}</td><td style={{ color: '#f59e0b', fontWeight: 700 }}>{fmt(rev.new_hostel_fee + rev.new_mess_fee)}</td><td>{rev.changed_by_name || '—'}</td><td>{rev.notes || '—'}</td></tr>)}</tbody></table></div>}
          <h3 style={{ fontSize: 14, margin: '4px 0 8px' }}>Payment Transactions</h3>
          {hostelHistory.payments.length === 0 ? <div className="empty-state" style={{ padding: 18 }}>No payments recorded for this student yet.</div> : <div className="table-container" style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12 }}><table><thead><tr><th>Payment Date</th><th>Fee Month</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th></tr></thead><tbody>{hostelHistory.payments.map(payment => <tr key={payment.id}><td>{displayDate(payment.payment_date)}</td><td>{payment.period_from ? monthLabel(monthValue(new Date(`${payment.period_from}T00:00:00`))) : '—'}</td><td style={{ fontWeight: 700, color: '#10b981' }}>{fmt(payment.amount)}</td><td>{payment.payment_method}</td><td>{payment.reference || '—'}</td><td>{payment.recorded_by_name || '—'}</td></tr>)}</tbody></table></div>}
        </div>}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}><button className="btn btn-secondary" onClick={() => setHistoryModal(false)}>Close</button></div>
      </div></div>}

      {staffSettingsOpen && <div className="modal-overlay" onClick={() => setStaffSettingsOpen(false)}><div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}><div className="modal-header"><h2 className="modal-title">Senior Staff Settings</h2><button className="modal-close" onClick={() => setStaffSettingsOpen(false)}><FiX /></button></div><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add one senior staff name per line. These names appear in the receipt’s Handover By dropdown.</p><textarea className="form-control" rows={5} value={staffDraft} onChange={e => setStaffDraft(e.target.value)} placeholder="Senior staff name 1\nSenior staff name 2" /><div className="form-actions"><button className="btn btn-primary" onClick={saveSeniorStaff}>Save Staff</button><button className="btn btn-secondary" onClick={() => setStaffSettingsOpen(false)}>Cancel</button></div></div></div>}

      {receiptTarget && <div className="modal-overlay receipt-overlay" onClick={() => setReceiptTarget(null)}><style>{`@media print { body * { visibility: hidden !important; } #hostel-receipt-print, #hostel-receipt-print * { visibility: visible !important; } #hostel-receipt-print { position: fixed; left: 0; top: 0; width: 100%; max-width: none !important; margin: 0 !important; box-sizing: border-box; } .no-print { display: none !important; } }`}</style><div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 860, width: 'min(860px, 96vw)', maxHeight: '94vh', overflowY: 'auto' }}><div className="modal-header no-print"><h2 className="modal-title">Receipt Preview</h2><button className="modal-close" onClick={() => setReceiptTarget(null)}><FiX /></button></div><div id="hostel-receipt-print" className="receipt" style={{ border: '3px double #283c75', padding: 28, minHeight: 390, background: '#fff', color: '#172554', fontFamily: 'Georgia, serif', maxWidth: 800, margin: '0 auto' }}><div style={{ textAlign: 'center', fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>NALAM TRUST</div><div style={{ textAlign: 'center', margin: '8px auto 24px', background: '#283c75', color: '#fff', width: 'max-content', padding: '5px 18px', fontWeight: 700 }}>RECEIPT</div><div style={{ textAlign: 'right', marginBottom: 20 }}>Date: {displayDate(receiptPaymentDate)}</div><div style={{ borderBottom: '1px dotted #333', padding: '14px 0' }}>Received with thanks from M/s. <strong>{receiptTarget.full_name}</strong></div><div style={{ borderBottom: '1px dotted #333', padding: '14px 0' }}>a sum of Rupees <strong>{fmt(receiptAmount)}</strong></div><div style={{ borderBottom: '1px dotted #333', padding: '14px 0' }}>towards <strong>Hostel &amp; Mess Fees — {monthLabel(periodMonth)}</strong></div><div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}><div style={{ border: '1px solid #283c75', padding: 12, fontSize: 22, fontWeight: 800, minWidth: 160 }}>{fmt(receiptAmount)}</div><div style={{ textAlign: 'right' }}>For NALAM TRUST<br/><br/><strong>Handover By: {receiptStaff || '________________'}</strong><br/><small>Trustee / Managing Trustee</small></div></div></div><div className="form-actions no-print" style={{ justifyContent: 'flex-end' }}><label style={{ marginRight: 'auto', minWidth: 220 }}>Payment Date<input type="date" className="form-control" value={receiptPaymentDate} onChange={e => setReceiptPaymentDate(e.target.value)} /></label><label style={{ minWidth: 220 }}>Handover By<select className="form-control" value={receiptStaff} onChange={e => setReceiptStaff(e.target.value)}><option value="">Select Senior Staff</option>{seniorStaff.map(name => <option key={name} value={name}>{name}</option>)}</select></label><button className="btn btn-secondary" onClick={downloadReceipt}><FiDownload style={{ marginRight: 5 }} />Download</button><button className="btn btn-primary" onClick={printReceipt}><FiPrinter style={{ marginRight: 5 }} />Print</button></div></div></div>}

    </div>
  );
};

export default HostelList;
