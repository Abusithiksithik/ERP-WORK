import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { FiRefreshCw, FiAlertCircle, FiCheck } from 'react-icons/fi';

type YearFilter = 'All' | '1st Year' | '2nd Year';
type Period = 'day' | 'week' | 'month';
interface Cohort {
  course_id: number; course_name: string; category_name: string; batch_id: number; batch_name: string;
  start_date: string | null; end_date: string | null; approved_seats: number; joined: number;
  vacant: number; filled_pct: number; year: Exclude<YearFilter,'All'>; present_today: number;
}
interface FeeRow { fee_type: string; due: number; paid: number; balance: number; strength: number; }
interface AttendanceCohort { course_name: string; batch_name: string; students: number; present: number; marked: number; below_75: number; }
interface TrendPoint { date: string; present: number; marked: number; percentage: number | null; }
interface DashboardData {
  cohorts: Cohort[]; seatTotals: { approved:number; joined:number; vacant:number; filledPct:number };
  fees: FeeRow[]; feeTotal: {due:number;paid:number;balance:number;strength:number}; feeCohorts:Array<{batch_id:string;course_name:string;batch_name:string;strength:number;due:number;paid:number;balance:number;collected_pct:number}>;
  attendance: { cohorts:AttendanceCohort[]; trend:TrendPoint[]; overall:{students:number;present:number;marked:number;working_days:number;below_75:number} };
}
const money = (value:number) => `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
const percent = (value:number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
const toDateInput = (value:string | null) => value ? String(value).slice(0,10) : '';
const displayDate = (value:string | null) => value ? new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const yearLabel = (batch:string) => batch.startsWith('2026') ? '1st Year' : batch.startsWith('2025') ? '2nd Year' : '—';

const currentReportYear = () => new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
const reportRowsForFilters = (rows:any[], course:string, year:YearFilter) => rows.filter(row => {
  if (course !== 'All' && String(row.course_name || '') !== course) return false;
  if (year !== 'All') {
    const batch = String(row.batch_name || '');
    if (year === '1st Year' && !batch.startsWith('2026')) return false;
    if (year === '2nd Year' && !batch.startsWith('2025')) return false;
  }
  return true;
});
const buildReportFeeSummary = (reports:{enrollment:any[];hostel:any[];exam:any[];uniform:any[]}) => {
  const definitions = [
    { fee_type:'Tuition Fee', rows:reports.enrollment, amount:(r:any)=>Number(r.total_fee||0)-Number(r.discount||0) },
    { fee_type:'Uniform Fee', rows:reports.uniform, amount:(r:any)=>Number(r.total_amount||0) },
    { fee_type:'Exam Fee', rows:reports.exam, amount:(r:any)=>Number(r.exam_fee||0)-Number(r.discount||0) },
    { fee_type:'Hostel & Mess Fee', rows:reports.hostel, amount:(r:any)=>Number(r.total_fee||0)-Number(r.discount||0) },
  ];
  const fees:FeeRow[] = definitions.map(def => {
    const students = new Set(def.rows.map((r:any)=>String(r.student_code||'')).filter(Boolean));
    return { fee_type:def.fee_type, due:def.rows.reduce((sum:number,r:any)=>sum+Math.max(0,def.amount(r)),0), paid:def.rows.reduce((sum:number,r:any)=>sum+Number(r.amount_paid||0),0), balance:def.rows.reduce((sum:number,r:any)=>sum+Number(r.balance_due||0),0), strength:students.size };
  });
  const groups = new Map<string,{batch_id:string;course_name:string;batch_name:string;students:Set<string>;due:number;paid:number;balance:number}>();
  definitions.forEach(def => def.rows.forEach((r:any) => {
    const courseName=String(r.course_name||'Unknown Course'); const batchName=String(r.batch_name||'');
    const key=`${courseName}::${batchName}`;
    if(!groups.has(key)) groups.set(key,{batch_id:key,course_name:courseName,batch_name:batchName,students:new Set<string>(),due:0,paid:0,balance:0});
    const group=groups.get(key)!; if(r.student_code) group.students.add(String(r.student_code));
    group.due+=Math.max(0,def.amount(r)); group.paid+=Number(r.amount_paid||0); group.balance+=Number(r.balance_due||0);
  }));
  const feeCohorts=Array.from(groups.values()).map(g=>({batch_id:g.batch_id,course_name:g.course_name,batch_name:g.batch_name,strength:g.students.size,due:g.due,paid:g.paid,balance:g.balance,collected_pct:g.due?Math.min(100,g.paid/g.due*100):0})).sort((a,b)=>a.course_name.localeCompare(b.course_name)||a.batch_name.localeCompare(b.batch_name));
  const totals=fees.reduce((a,r)=>({due:a.due+r.due,paid:a.paid+r.paid,balance:a.balance+r.balance}),{due:0,paid:0,balance:0});
  const reportStudentCount=new Set(definitions.flatMap(def=>def.rows.map((r:any)=>String(r.student_code||'')).filter(Boolean))).size;
  const feeTotal={...totals,strength:reportStudentCount};
  return {fees,feeCohorts,feeTotal};
};
const COURSE_OPTIONS = ['DHA','DMLT','DOT'];

const Dashboard: React.FC = () => {
  const [course,setCourse] = useState('All');
  const [year,setYear] = useState<YearFilter>('All');
  const [period,setPeriod] = useState<Period>('day');
  const [data,setData] = useState<DashboardData | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState<number | null>(null);
  const [saved,setSaved] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const reportYear = currentReportYear();
      const now = new Date();
      const periodMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const [response, enrollmentReport, hostelReport, examReport, uniformReport] = await Promise.allSettled([
        api.get('/dashboard/academy',{params:{course,year,period}}),
        api.get('/reports/enrollment',{params:{year:reportYear}}),
        api.get('/reports/hostel',{params:{year:reportYear,period_month:periodMonth}}),
        api.get('/reports/exam-fee',{params:{year:reportYear}}),
        api.get('/reports/uniform',{params:{year:reportYear}}),
      ]);
      if (response.status !== 'fulfilled' || !response.value.data?.success || !response.value.data?.data) {
        throw new Error(response.status === 'rejected' ? (response.reason?.response?.data?.message || 'Dashboard data could not be loaded.') : 'Dashboard response was incomplete');
      }
      const reportResults = [enrollmentReport,hostelReport,examReport,uniformReport];
      if (reportResults.every(result => result.status === 'fulfilled' && Array.isArray(result.value.data?.data))) {
        const getRows = (result:any) => result.status === 'fulfilled' ? result.value.data.data : [];
        const filteredReports = {
          enrollment: reportRowsForFilters(getRows(enrollmentReport),course,year),
          hostel: reportRowsForFilters(getRows(hostelReport),course,year),
          exam: reportRowsForFilters(getRows(examReport),course,year),
          uniform: reportRowsForFilters(getRows(uniformReport),course,year),
        };
        setData({...response.value.data.data,...buildReportFeeSummary(filteredReports)});
      } else {
        // Preserve dashboard availability for roles that cannot access detailed Reports pages.
        setData(response.value.data.data);
        setError('Detailed report totals are not available for this account. Showing the standard dashboard totals.');
      }
    } catch (e:any) {
      setError(e?.response?.data?.message || e?.message || 'Dashboard data could not be loaded.');
    } finally { setLoading(false); }
  },[course,year,period]);
  useEffect(()=>{ void load(); },[load]);

  const updateSeats = async (row:Cohort, value:string) => {
    const seats = Number(value);
    if (!Number.isInteger(seats) || seats < 0) { setError('Approved seats must be zero or a positive whole number.'); return; }
    setSaving(row.batch_id); setSaved(null); setError('');
    try { await api.put(`/dashboard/academy/seats/${row.batch_id}`,{approved_seats:seats}); await load(); setSaved(row.batch_id); }
    catch(e:any) { setError(e?.response?.data?.message || 'Could not save approved seats.'); }
    finally { setSaving(null); }
  };
  const updateBatchDate = async (row:Cohort, field:'start_date'|'end_date', value:string) => {
    const start = field==='start_date' ? value : toDateInput(row.start_date);
    const end = field==='end_date' ? value : toDateInput(row.end_date);
    if (start && end && end < start) { setError('Batch end date cannot be earlier than start date.'); return; }
    try {
      await api.put(`/batches/${row.batch_id}`,{batch_name:row.batch_name,course_id:row.course_id,start_date:start || null,end_date:end || null,status:'active'});
      await load();
    } catch(e:any) { setError(e?.response?.data?.message || 'Could not update batch dates.'); }
  };

  const todayJoined = data?.cohorts.reduce((sum,row)=>sum+row.joined,0) || 0;
  const todayPresent = data?.cohorts.reduce((sum,row)=>sum+Number(row.present_today||0),0) || 0;
  const attendancePct = todayJoined ? todayPresent/todayJoined*100 : 0;
  const feeRows = data?.fees || [];
  const totalDue = data?.feeTotal.due || 0;
  const collectedPct = totalDue ? (data?.feeTotal.paid || 0)/totalDue*100 : 0;
  const currentDate = useMemo(()=>new Date().toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}),[]);

  return <main className="academy-dashboard-v2">
    <style>{`
      .academy-dashboard-v2{--bg:#0d1220;--panel:#141a2b;--panel2:#0f1424;--border:#232c42;--border2:#1b2338;--text:#e6e9f0;--muted:#9aa2b5;--faint:#6b7488;--purple:#6f5cf2;--green:#5fd0a8;--amber:#f0b45a;--red:#f28b8b;--blue:#6ea8fe;color:var(--text);padding:20px 22px 34px;max-width:1440px;margin:auto;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
      .ad2-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:20px}.ad2-title{font-size:22px;font-weight:600;color:#f1f3f9;letter-spacing:-.01em;margin:0}.ad2-sub{font-size:13px;color:var(--faint);margin:4px 0 0}.ad2-filters{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}.ad2-filter-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);margin-bottom:5px}.ad2-seg{display:flex;border-radius:8px;overflow:hidden;border:1px solid var(--border)}.ad2-seg button{padding:8px 13px;font-size:13px;background:var(--panel);color:var(--muted);border:0;cursor:pointer}.ad2-seg button.active{background:var(--purple);color:#fff}.ad2-refresh{display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:8px;padding:8px 11px;background:var(--panel);color:var(--text);font-size:12px;cursor:pointer}.ad2-refresh:disabled{opacity:.55;cursor:wait}
      .ad2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:22px}.ad2-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;min-width:0}.ad2-kpi{padding:14px 16px}.ad2-kpi-label{font-size:12px;color:var(--faint)}.ad2-kpi-value{font-size:26px;font-weight:600;color:#f1f3f9;margin-top:4px;letter-spacing:-.02em}.ad2-kpi-value.green{color:var(--green)}.ad2-kpi-value.red{color:var(--red)}.ad2-kpi-value.amber{color:var(--amber)}.ad2-kpi-sub{font-size:12px;color:var(--muted);margin-top:2px}.ad2-section{margin-bottom:26px}.ad2-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}.ad2-section-title{font-size:15px;font-weight:600;color:#f1f3f9;margin:0}.ad2-note{font-size:12px;color:var(--faint)}.ad2-table-wrap{overflow-x:auto;border-radius:12px}.ad2-table{width:100%;border-collapse:collapse;font-size:13px;min-width:760px}.ad2-table th{text-align:left;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:var(--faint);padding:10px 13px;background:var(--panel);border-bottom:1px solid var(--border);white-space:nowrap}.ad2-table td{padding:10px 13px;border-top:1px solid var(--border2);color:#c4c9d6;vertical-align:middle}.ad2-table tr:first-child td{border-top:0}.ad2-table th.r,.ad2-table td.r{text-align:right}.ad2-table tr.total td{background:#12172a;color:#f1f3f9;font-weight:600;border-top:1px solid #2a3145}.ad2-course-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 7px;border-radius:5px;background:#1a1730;color:#b7aefc;border:1px solid #34305a;margin-right:8px}.ad2-input{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;outline:none;color-scheme:dark}.ad2-input:focus{border-color:var(--purple)}.ad2-input.seats{width:78px;text-align:right}.ad2-barline{display:flex;align-items:center;gap:10px;min-width:150px}.ad2-bar{height:7px;border-radius:99px;background:#1d2438;overflow:hidden;flex:1;min-width:65px}.ad2-bar span{display:block;height:100%;border-radius:99px}.ad2-pct{width:42px;text-align:right;font-size:12px;color:#f1f3f9}.ad2-chip{font-size:11px;padding:3px 9px;border-radius:999px;display:inline-block;white-space:nowrap}.ad2-chip.run{color:var(--green);background:#0f2a22;border:1px solid #1d4536}.ad2-chip.up{color:var(--blue);background:#101f36;border:1px solid #1d3558}.ad2-chip.done{color:var(--muted);background:#1c2030;border:1px solid #2a3145}.ad2-fee-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:13px}.ad2-fee{padding:15px}.ad2-fee h3{margin:0 0 3px;font-size:14px;font-weight:600;color:#f1f3f9}.ad2-fee-hint{font-size:11px;color:var(--faint);margin-bottom:12px;min-height:14px}.ad2-stat{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:5px 0;font-size:12px}.ad2-stat span:first-child{color:var(--muted)}.ad2-stat span:last-child{color:#f1f3f9;font-weight:500;text-align:right}.ad2-green{color:var(--green)!important}.ad2-red{color:var(--red)!important}.ad2-amber{color:var(--amber)!important}.ad2-fee .ad2-bar{margin-top:9px}.ad2-collected{display:flex;justify-content:space-between;font-size:11px;color:var(--faint);margin-top:6px}.ad2-att-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:12px}.ad2-chart{padding:14px 16px;min-height:230px}.ad2-chart-title{font-size:13px;color:var(--muted)}.ad2-plot{height:155px;display:flex;align-items:flex-end;gap:7px;padding:10px 4px 0;position:relative}.ad2-col{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;position:relative;min-width:0}.ad2-colbar{width:68%;max-width:38px;border-radius:4px 4px 0 0;min-height:2px}.ad2-colval{position:absolute;left:0;right:0;text-align:center;font-size:10px;color:var(--muted);white-space:nowrap}.ad2-xlabels{display:flex;gap:7px;padding:7px 4px 0}.ad2-xlabels span{flex:1;text-align:center;font-size:10px;color:var(--faint);white-space:nowrap;overflow:hidden}.ad2-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--faint);padding-top:12px}.ad2-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}.ad2-empty{padding:28px;text-align:center;color:var(--faint);font-size:12px}.ad2-recent{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ad2-person{padding:11px 13px}.ad2-person strong{font-size:13px;color:#e6e9f0;display:block}.ad2-person span{font-size:11px;color:var(--faint)}.ad2-error{padding:10px 12px;margin-bottom:14px;border-radius:8px;background:#321b24;border:1px solid #63313c;color:#f3a6ad;font-size:12px}.ad2-footer{font-size:10px;color:var(--faint);padding:2px 2px 0;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
      @media(max-width:900px){.academy-dashboard-v2{padding:16px 14px 28px}.ad2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ad2-att-grid{grid-template-columns:1fr}.ad2-fee-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.academy-dashboard-v2{padding:14px 10px 26px}.ad2-head{align-items:flex-start}.ad2-filters{width:100%;align-items:flex-start}.ad2-filter{width:100%}.ad2-seg{width:100%}.ad2-seg button{flex:1;padding:8px 7px}.ad2-kpis{gap:9px}.ad2-kpi{padding:12px}.ad2-kpi-value{font-size:21px}.ad2-fee-grid{grid-template-columns:1fr}.ad2-recent{grid-template-columns:1fr}.ad2-section{margin-bottom:22px}}
    `}</style>

    <header className="ad2-head">
      <div><h1 className="ad2-title">Academy Dashboard</h1><p className="ad2-sub">DHA · DMLT · DOT — {currentDate}</p></div>
      <div className="ad2-filters">
        <div className="ad2-filter"><div className="ad2-filter-label">Course</div><div className="ad2-seg">{['All',...COURSE_OPTIONS].map(v=><button key={v} className={course===v?'active':''} onClick={()=>setCourse(v)}>{v}</button>)}</div></div>
        <div className="ad2-filter"><div className="ad2-filter-label">Year</div><div className="ad2-seg">{(['All','1st Year','2nd Year'] as YearFilter[]).map(v=><button key={v} className={year===v?'active':''} onClick={()=>setYear(v)}>{v}</button>)}</div></div>
        <button className="ad2-refresh" onClick={()=>void load()} disabled={loading}><FiRefreshCw/> Refresh</button>
      </div>
    </header>
    {error && <div className="ad2-error"><FiAlertCircle style={{verticalAlign:'-2px',marginRight:6}}/>{error}</div>}

    <section className="ad2-kpis">
      <div className="ad2-card ad2-kpi"><div className="ad2-kpi-label">Students Joined</div><div className="ad2-kpi-value">{loading&&!data?'—':`${data?.seatTotals.joined||0} / ${data?.seatTotals.approved||0} seats`}</div><div className="ad2-kpi-sub">{percent(data?.seatTotals.filledPct||0)} seats filled</div></div>
      <div className="ad2-card ad2-kpi"><div className="ad2-kpi-label">Fees Collected</div><div className="ad2-kpi-value green">{data?money(data.feeTotal.paid):'—'}</div><div className="ad2-kpi-sub">of {money(totalDue)} ({percent(collectedPct)})</div></div>
      <div className="ad2-card ad2-kpi"><div className="ad2-kpi-label">Balance to Collect</div><div className="ad2-kpi-value red">{data?money(data.feeTotal.balance):'—'}</div><div className="ad2-kpi-sub">Across all 4 fee types</div></div>
      <div className="ad2-card ad2-kpi"><div className="ad2-kpi-label">Attendance — {new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div><div className="ad2-kpi-value amber">{data?percent(attendancePct):'—'}</div><div className="ad2-kpi-sub">{todayPresent} of {todayJoined} students present</div></div>
    </section>

    <section className="ad2-section">
      <div className="ad2-section-head"><h2 className="ad2-section-title">Seats — Government Approved vs Joined</h2><span className="ad2-note">Approved seats can be edited by Admin / Incharge</span></div>
      <div className="ad2-card ad2-table-wrap"><table className="ad2-table"><thead><tr><th>Course / Year</th><th className="r">Approved Seats</th><th className="r">Joined</th><th className="r">Vacant</th><th style={{minWidth:190}}>Seats Filled</th></tr></thead><tbody>
        {(data?.cohorts||[]).map(row=><tr key={row.batch_id}><td><span className="ad2-course-tag">{row.course_name}</span>{yearLabel(row.batch_name)}</td><td className="r"><input aria-label={`Approved seats ${row.course_name} ${row.batch_name}`} className="ad2-input seats" type="number" min="0" defaultValue={row.approved_seats} onBlur={e=>{if(Number(e.currentTarget.value)!==row.approved_seats)void updateSeats(row,e.currentTarget.value)}} disabled={saving===row.batch_id}/>{saved===row.batch_id&&<FiCheck className="ad2-green" style={{marginLeft:5}}/>}</td><td className="r">{row.joined}</td><td className="r" style={{color:row.vacant?'var(--amber)':'var(--green)'}}>{row.vacant}</td><td><div className="ad2-barline"><div className="ad2-bar"><span style={{width:`${Math.min(row.filled_pct,100)}%`,background:row.filled_pct>=90?'var(--green)':'var(--amber)'}}/></div><span className="ad2-pct">{Math.round(row.filled_pct)}%</span></div></td></tr>)}
        {data?.cohorts.length===0&&<tr><td colSpan={5} className="ad2-empty">No active 2025–2027 / 2026–2028 batches found for this filter.</td></tr>}
        <tr className="total"><td>Total</td><td className="r">{data?.seatTotals.approved||0}</td><td className="r">{data?.seatTotals.joined||0}</td><td className="r">{data?.seatTotals.vacant||0}</td><td><div className="ad2-barline"><div className="ad2-bar"><span style={{width:`${Math.min(data?.seatTotals.filledPct||0,100)}%`,background:'var(--purple)'}}/></div><span className="ad2-pct">{Math.round(data?.seatTotals.filledPct||0)}%</span></div></td></tr>
      </tbody></table></div>
    </section>

    <section className="ad2-section">
      <div className="ad2-section-head"><h2 className="ad2-section-title">Batch Start &amp; End Period</h2><span className="ad2-note">Dates are editable</span></div>
      <div className="ad2-card ad2-table-wrap"><table className="ad2-table"><thead><tr><th>Course / Year</th><th>Batch</th><th>Start</th><th>End</th><th>Status</th><th style={{minWidth:160}}>Course Progress</th></tr></thead><tbody>
        {(data?.cohorts||[]).map(row=>{const start=toDateInput(row.start_date),end=toDateInput(row.end_date),now=new Date();const s=start?new Date(`${start}T00:00:00`):null,e=end?new Date(`${end}T00:00:00`):null;const total=s&&e?Math.max(e.getTime()-s.getTime(),1):1;const elapsed=s?now.getTime()-s.getTime():0;const progress=s&&e?Math.max(0,Math.min(100,elapsed/total*100)):0;const daysLeft=e?Math.max(0,Math.ceil((e.getTime()-now.getTime())/86400000)):0;const status=!s||!e?'Dates missing':now<s?'Upcoming':now>e?'Completed':`Running · ${daysLeft} days left`;return <tr key={`batch-${row.batch_id}`}><td><span className="ad2-course-tag">{row.course_name}</span>{yearLabel(row.batch_name)}</td><td>{row.course_name} {row.batch_name}</td><td><input aria-label="Batch start date" className="ad2-input" type="date" value={start} onChange={e=>void updateBatchDate(row,'start_date',e.target.value)}/></td><td><input aria-label="Batch end date" className="ad2-input" type="date" value={end} onChange={e=>void updateBatchDate(row,'end_date',e.target.value)}/></td><td><span className={`ad2-chip ${status.startsWith('Running')?'run':status==='Upcoming'?'up':'done'}`}>{status}</span></td><td><div className="ad2-barline"><div className="ad2-bar"><span style={{width:`${progress}%`,background:'var(--blue)'}}/></div><span className="ad2-pct">{Math.round(progress)}%</span></div></td></tr>})}
      </tbody></table></div>
    </section>

    <section className="ad2-section">
      <div className="ad2-section-head"><h2 className="ad2-section-title">Fees Report</h2><span className="ad2-note">Hostel &amp; Mess applies only to students staying in hostel</span></div>
      <div className="ad2-fee-grid">{['Tuition Fee','Uniform Fee','Exam Fee','Hostel & Mess Fee'].map(name=>{const f=feeRows.find(x=>x.fee_type===name);const due=f?.due||0,paid=f?.paid||0,balance=f?.balance||0,pct=due?paid/due*100:0;return <article className="ad2-card ad2-fee" key={name}><h3>{name}</h3><div className="ad2-fee-hint">{name==='Hostel & Mess Fee'?'Only students staying in hostel':' '}</div><div className="ad2-stat"><span>Total Strength</span><span>{f?.strength||0}</span></div><div className="ad2-stat"><span>Total Fees to be Paid</span><span>{money(due)}</span></div><div className="ad2-stat"><span>Fees Paid</span><span className="ad2-green">{money(paid)}</span></div><div className="ad2-stat"><span>Balance</span><span className="ad2-red">{money(balance)}</span></div><div className="ad2-bar"><span style={{width:`${Math.min(pct,100)}%`,background:pct>=80?'var(--green)':'var(--amber)'}}/></div><div className="ad2-collected"><span>Collected</span><span>{percent(pct)}</span></div></article>})}</div>
      <div className="ad2-card ad2-table-wrap"><table className="ad2-table"><thead><tr><th>Course / Year (all 4 fees)</th><th className="r">Strength</th><th className="r">Fees to be Paid</th><th className="r">Fees Paid</th><th className="r">Balance</th><th style={{minWidth:160}}>Collected</th></tr></thead><tbody>
        {(data?.feeCohorts||[]).map(row=><tr key={`fee-${row.batch_id}`}><td><span className="ad2-course-tag">{row.course_name}</span>{yearLabel(row.batch_name)}</td><td className="r">{row.strength}</td><td className="r">{money(row.due)}</td><td className="r ad2-green">{money(row.paid)}</td><td className="r ad2-red">{money(row.balance)}</td><td><div className="ad2-barline"><div className="ad2-bar"><span style={{width:`${Math.min(row.collected_pct,100)}%`,background:row.collected_pct>=80?'var(--green)':'var(--amber)'}}/></div><span className="ad2-pct">{Math.round(row.collected_pct)}%</span></div></td></tr>)}
        <tr className="total"><td>Total</td><td className="r">{data?.feeTotal.strength ?? data?.seatTotals.joined ?? 0}</td><td className="r">{money(data?.feeTotal.due||0)}</td><td className="r ad2-green">{money(data?.feeTotal.paid||0)}</td><td className="r ad2-red">{money(data?.feeTotal.balance||0)}</td><td><div className="ad2-barline"><div className="ad2-bar"><span style={{width:`${Math.min(collectedPct,100)}%`,background:'var(--purple)'}}/></div><span className="ad2-pct">{Math.round(collectedPct)}%</span></div></td></tr>
      </tbody></table></div>
    </section>

    <section className="ad2-section">
      <div className="ad2-section-head"><div><h2 className="ad2-section-title">Attendance Report</h2><div className="ad2-note">{currentDate} · Sundays excluded from trend</div></div><div className="ad2-seg">{(['day','week','month'] as Period[]).map(v=><button key={v} className={period===v?'active':''} onClick={()=>setPeriod(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div></div>
      <div className="ad2-att-grid"><div className="ad2-card ad2-table-wrap"><table className="ad2-table"><thead><tr><th>Course / Year</th><th className="r">Students</th><th style={{minWidth:145}}>Attendance %</th><th className="r">Below 75%</th></tr></thead><tbody>
        {(data?.attendance.cohorts||[]).map(row=>{const expected=row.students*(data?.attendance.overall.working_days||1);const pct=expected?row.present/expected*100:0;return <tr key={`${row.course_name}-${row.batch_name}`}><td><span className="ad2-course-tag">{row.course_name}</span>{yearLabel(row.batch_name)}</td><td className="r">{row.students}</td><td><div className="ad2-barline"><div className="ad2-bar"><span style={{width:`${pct}%`,background:pct>=85?'var(--green)':pct>=75?'var(--amber)':'var(--red)'}}/></div><span className="ad2-pct">{row.marked?percent(pct):'—'}</span></div></td><td className="r" style={{color:row.below_75?'var(--red)':'var(--green)'}}>{row.below_75}</td></tr>})}
        <tr className="total"><td>Overall</td><td className="r">{data?.attendance.overall.students||0}</td><td>{data?.attendance.overall.students&&data?.attendance.overall.working_days?percent(data.attendance.overall.present/(data.attendance.overall.students*data.attendance.overall.working_days)*100):'—'}</td><td className="r">{data?.attendance.overall.below_75||0}</td></tr>
      </tbody></table></div>
      <div className="ad2-card ad2-chart"><div className="ad2-chart-title">Daily attendance — last 14 working days</div>{(data?.attendance.trend||[]).length?<><div className="ad2-plot">{data!.attendance.trend.map(point=>{const pct=point.percentage??0;const h=pct===0?2:Math.max(2,Math.min(100,pct));const color=pct>=85?'var(--green)':pct>=75?'var(--amber)':'var(--red)';return <div className="ad2-col" key={point.date} title={`${displayDate(point.date)}: ${point.percentage===null?'No attendance marked':percent(pct)}`}><span className="ad2-colval" style={{bottom:`calc(${h}% + 3px)`}}>{point.percentage===null?'':`${Math.round(pct)}%`}</span><div className="ad2-colbar" style={{height:`${h}%`,background:color}}/></div>})}</div><div className="ad2-xlabels">{data!.attendance.trend.map(p=><span key={p.date}>{new Date(`${p.date}T00:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span>)}</div><div className="ad2-legend"><span><i style={{background:'var(--green)'}}/>85%+</span><span><i style={{background:'var(--amber)'}}/>75–85%</span><span><i style={{background:'var(--red)'}}/>Below 75%</span></div></>:<div className="ad2-empty">No attendance records found for the selected period.</div>}</div></div>
    </section>

    <footer className="ad2-footer"><span>Nalam Academy · EPFT Management System</span><span>Figures are calculated from current academy records; no demo values are used.</span></footer>
  </main>;
};
export default Dashboard;
