import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Search,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Tag,
  Calendar,
  XCircle,
  Palette,
  Check,
  Loader2,
} from 'lucide-react';

// --- Helper Function: แปลงวันที่ ---
const parseDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    );
  }
  return new Date(dateStr);
};

const COLORS = [
  '#60a5fa',
  '#facc15',
  '#a78bfa',
  '#34d399',
  '#f87171',
  '#fb923c',
  '#818cf8',
];

export default function CouponDashboard() {
  const [couponSearch, setCouponSearch] = useState('');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');

  // --- Fetch Data from Google Sheet CSV ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          'https://docs.google.com/spreadsheets/d/e/2PACX-1vRgBMYkyZg_XWd7eVJZ_ogSeTlhif7YKEoQH8-eDEtqOYPo-QwzQlqKvdqIb2zopWBBUUmQmVZnZEp7/pub?gid=0&single=true&output=csv'
        );
        const text = await response.text();
        const lines = text.split('\n');
        const headers = lines[0]
          .split(',')
          .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

        const data = lines
          .slice(1)
          .filter((l) => l.trim())
          .map((line) => {
            const values = line
              .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
              .map((val) => val.trim().replace(/^"|"$/g, ''));
            const getIdx = (keyPart) =>
              headers.findIndex((h) => h.includes(keyPart));

            const dateIdx = getIdx('date') !== -1 ? getIdx('date') : 0;
            const orderIdx = getIdx('order') !== -1 ? getIdx('order') : 1;
            const productIdx = getIdx('product') !== -1 ? getIdx('product') : 2;
            const couponIdx = getIdx('coupon') !== -1 ? getIdx('coupon') : 3;
            const discountIdx =
              getIdx('discount') !== -1
                ? getIdx('discount')
                : headers.findIndex((h) => h.includes('ส่วนลด')) !== -1
                ? headers.findIndex((h) => h.includes('ส่วนลด'))
                : 5;

            return {
              date: values[dateIdx] || '',
              orderId: values[orderIdx] || '',
              product: values[productIdx]
                ? values[productIdx].trim()
                : 'Unknown',
              coupon: values[couponIdx] || '-',
              discount: parseFloat(values[discountIdx] || 0),
            };
          })
          .filter((item) => {
            const productLower = String(item.product).toLowerCase();
            const isUrlOrScript =
              productLower.includes('http') ||
              productLower.includes('script.google') ||
              productLower.includes('/exec') ||
              productLower.includes('macros');
            const isInvalid =
              productLower === 'unknown' ||
              productLower === '' ||
              productLower === '-';
            return !isUrlOrScript && !isInvalid;
          });

        setRawData(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const themes = {
    dark: {
      bg: 'bg-slate-900',
      text: 'text-white',
      subText: 'text-slate-400',
      cardBg: 'backdrop-blur-xl bg-white/5 border-white/10',
      inputBg: 'bg-black/20 border-white/10 text-white placeholder-slate-500',
      accentGradient:
        'bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent',
      iconColor: 'text-blue-400',
      gridColor: '#ffffff10',
      tooltipBg: 'bg-slate-800 border-slate-600 text-white',
      tableHeader: 'bg-black/20 text-slate-400',
      tableRowHover: 'hover:bg-white/5',
      tableText: 'text-slate-300',
      highlightText: 'text-white',
    },
    gray: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      subText: 'text-gray-500',
      cardBg: 'bg-white border-gray-200 shadow-sm',
      inputBg: 'bg-white border-gray-300 text-gray-800 placeholder-gray-400',
      accentGradient: 'text-blue-600',
      iconColor: 'text-blue-600',
      gridColor: '#e5e7eb',
      tooltipBg: 'bg-white border-gray-200 text-gray-800 shadow-lg',
      tableHeader: 'bg-gray-50 text-gray-600',
      tableRowHover: 'hover:bg-gray-50',
      tableText: 'text-gray-600',
      highlightText: 'text-gray-900',
    },
    matte: {
      bg: 'bg-[#1e1e1e]',
      text: 'text-[#d4d4d4]',
      subText: 'text-[#858585]',
      cardBg: 'bg-[#252526] border-[#333333] shadow-none',
      inputBg:
        'bg-[#3c3c3c] border-[#333333] text-[#cccccc] placeholder-[#858585] focus:bg-[#3c3c3c]',
      accentGradient: 'text-white',
      iconColor: 'text-[#cccccc]',
      gridColor: '#333333',
      tooltipBg: 'bg-[#252526] border-[#333333] text-[#d4d4d4] shadow-xl',
      tableHeader:
        'bg-[#2d2d2d] border-b border-[#333333] text-[#cccccc] font-medium',
      tableRowHover: 'hover:bg-[#2a2d2e]',
      tableText: 'text-[#cccccc]',
      highlightText: 'text-white',
    },
  };

  const currentStyle = themes[theme];

  const filteredData = useMemo(() => {
    if (loading) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return rawData.filter((item) => {
      const itemDate = parseDate(item.date);
      if (isNaN(itemDate.getTime())) return false;
      return (
        itemDate >= start &&
        itemDate <= end &&
        (couponSearch === '' ||
          item.coupon.toLowerCase().includes(couponSearch.toLowerCase()))
      );
    });
  }, [rawData, couponSearch, startDate, endDate, loading]);

  const totalUsage = filteredData.length;
  const totalDiscount = filteredData.reduce(
    (sum, item) => sum + item.discount,
    0
  );
  const productCount = {};
  filteredData.forEach(
    (item) =>
      (productCount[item.product] = (productCount[item.product] || 0) + 1)
  );
  const activeProducts = Object.keys(productCount);

  const pieData = Object.keys(productCount).map((key) => ({
    name: key,
    value: productCount[key],
  }));
  const barData = Object.keys(productCount).map((key) => ({
    name: key,
    discount: filteredData
      .filter((d) => d.product === key)
      .reduce((sum, d) => sum + d.discount, 0),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          className={`p-3 rounded-lg border shadow-xl ${currentStyle.tooltipBg}`}
        >
          <p className="font-bold mb-1">{label ? label : payload[0].name}</p>
          <p className="text-sm opacity-80">
            {payload[0].name}:{' '}
            <span className="font-mono font-semibold">
              {payload[0].value.toLocaleString()}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center ${currentStyle.bg} ${currentStyle.text}`}
      >
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="animate-pulse">กำลังโหลดข้อมูลจาก Google Sheet...</p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen font-sans p-4 md:p-8 overflow-hidden relative transition-colors duration-500 ${currentStyle.bg} ${currentStyle.text}`}
    >
      <style>{`
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 20s linear infinite; }
        .group:hover .animate-marquee { animation-play-state: paused; }
      `}</style>

      {theme === 'dark' && (
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse delay-1000"></div>
        </div>
      )}

      {/* Header Section */}
      <div
        className={`${currentStyle.cardBg} border rounded-2xl p-6 mb-8 shadow-sm transition-all duration-300`}
      >
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex flex-col gap-2">
            {/* แก้ไขส่วน Header เป็น Link ไปยังเว็บไซต์ */}
            <a
              href="https://wreath-r-rak.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group/title w-fit block"
            >
              <h1
                className={`text-3xl font-bold ${currentStyle.accentGradient} flex items-center gap-3 transition-all duration-300`}
              >
                <Tag className={`w-8 h-8 ${currentStyle.iconColor}`} />
                <span className="underline underline-offset-8 decoration-blue-500/40 group-hover/title:decoration-blue-400 transition-colors">
                  Wreath-R-Rak.com
                </span>
              </h1>
            </a>
            <p className={`${currentStyle.subText} text-sm`}>
              ยอดคูปองส่วนลด หรีดอารักษ์ (Live Data)
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">
            <div
              className={`flex items-center gap-2 p-2 rounded-lg border ${currentStyle.inputBg}`}
            >
              <Calendar className="w-4 h-4 opacity-60 ml-2" />
              <div className="flex gap-2">
                <input
                  type="date"
                  className={`bg-transparent border-none text-sm focus:ring-0 w-32 ${
                    theme === 'gray'
                      ? '[color-scheme:light]'
                      : '[color-scheme:dark]'
                  }`}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="opacity-50">-</span>
                <input
                  type="date"
                  className={`bg-transparent border-none text-sm focus:ring-0 w-32 ${
                    theme === 'gray'
                      ? '[color-scheme:light]'
                      : '[color-scheme:dark]'
                  }`}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="relative group w-full md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className={`h-4 w-4 ${currentStyle.subText}`} />
              </div>
              <input
                type="text"
                className={`block w-full pl-10 pr-10 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${currentStyle.inputBg}`}
                placeholder="ค้นหา Coupon Code..."
                value={couponSearch}
                onChange={(e) => setCouponSearch(e.target.value)}
              />
              {couponSearch && (
                <button
                  onClick={() => setCouponSearch('')}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${currentStyle.subText} hover:opacity-100`}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          {
            title: 'Total Usage',
            value: totalUsage,
            sub: 'Times Used',
            icon: ShoppingBag,
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
          },
          {
            title: 'Total Discount',
            value: totalDiscount.toLocaleString(),
            sub: 'THB Value',
            icon: DollarSign,
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
          },
          {
            title: 'Product List',
            value: totalUsage === 0 ? '-' : activeProducts,
            sub: 'Active Items',
            icon: TrendingUp,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
          },
        ].map((kpi, idx) => (
          <div
            key={idx}
            className={`relative group border rounded-xl p-6 hover:-translate-y-1 shadow-sm transition-all duration-300 ${currentStyle.cardBg}`}
          >
            <div className="flex justify-between items-start">
              <div className="w-full overflow-hidden">
                <p
                  className={`${currentStyle.subText} text-xs uppercase tracking-wider font-semibold mb-1`}
                >
                  {kpi.title}
                </p>
                {kpi.title === 'Product List' ? (
                  <div className="relative h-10 w-full overflow-hidden flex items-center">
                    {Array.isArray(kpi.value) ? (
                      <div className="whitespace-nowrap animate-marquee absolute left-0 flex items-center gap-6">
                        {kpi.value.map((product, i) => (
                          <span
                            key={i}
                            className="text-3xl font-bold flex items-center gap-2"
                            style={{ color: COLORS[i % COLORS.length] }}
                          >
                            {product}{' '}
                            <span
                              className={`w-1.5 h-1.5 rounded-full opacity-30 ${
                                theme === 'gray' ? 'bg-black' : 'bg-white'
                              }`}
                            ></span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <h3
                        className={`text-3xl font-bold ${currentStyle.highlightText}`}
                      >
                        {kpi.value}
                      </h3>
                    )}
                  </div>
                ) : (
                  <h3
                    className={`text-3xl font-bold ${currentStyle.highlightText} truncate max-w-[200px]`}
                  >
                    {kpi.value}
                  </h3>
                )}
                <p className={`${currentStyle.subText} text-xs mt-2`}>
                  {kpi.sub}
                </p>
              </div>
              <div
                className={`p-3 rounded-lg flex-shrink-0 ${kpi.bg} ${kpi.color}`}
              >
                <kpi.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div
          className={`${currentStyle.cardBg} border rounded-xl p-6 shadow-sm transition-all duration-300`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
            <h3 className={`text-lg font-bold ${currentStyle.highlightText}`}>
              Product Distribution
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className={`${currentStyle.cardBg} border rounded-xl p-6 shadow-sm transition-all duration-300`}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-amber-500 rounded-full"></div>
            <h3 className={`text-lg font-bold ${currentStyle.highlightText}`}>
              Discount Volume
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={true}
                  vertical={false}
                  stroke={currentStyle.gridColor}
                />
                <XAxis
                  type="number"
                  stroke={theme === 'gray' ? '#64748b' : '#94a3b8'}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={80}
                  stroke={theme === 'gray' ? '#64748b' : '#94a3b8'}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip
                  content={<CustomTooltip />}
                  cursor={{
                    fill: theme === 'gray' ? '#00000005' : '#ffffff05',
                  }}
                />
                <Bar
                  dataKey="discount"
                  fill="#f59e0b"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Theme Selectors */}
      <div className="fixed bottom-6 right-6 flex gap-2 bg-black/5 p-1 rounded-full backdrop-blur-sm border border-white/10 z-50 shadow-lg">
        {[
          { id: 'dark', color: 'bg-slate-900', label: 'Liquid Blue' },
          { id: 'gray', color: 'bg-gray-200', label: 'Soft Gray' },
          { id: 'matte', color: 'bg-[#1e1e1e]', label: 'Matte Dark' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`w-8 h-8 rounded-full border border-slate-500/30 shadow-sm flex items-center justify-center transition-transform hover:scale-110 ${t.color}`}
            title={t.label}
          >
            {theme === t.id && (
              <Check
                className={`w-4 h-4 ${
                  t.id === 'gray' ? 'text-black' : 'text-white'
                }`}
              />
            )}
          </button>
        ))}
      </div>

      <div
        className={`mt-8 text-center text-xs ${currentStyle.subText} font-mono opacity-60 pb-16`}
      >
        Dashboard นี้ ผู้ที่ได้สิทธิ์การเข้าถึงคูปองของผู้แทน "หรีดอารักษ์"
        เท่านั้น 🙏
      </div>
    </div>
  );
}
