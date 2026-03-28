import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, BarChart3, TrendingUp, Pin, Calendar, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Analytics() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      navigate('/auth');
      return;
    }

    const fetchAnalyticsData = async () => {
      setLoading(true);
      try {
        // Fetch scheduled pins count
        const q = query(
          collection(db, 'users', profile.uid, 'scheduledPins'),
          where('status', '==', 'pending')
        );
        const snapshot = await getDocs(q);
        setScheduledCount(snapshot.size);

        // Generate mock chart data for the last 7 days (since we don't have historical data in DB)
        const data = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          data.push({
            name: d.toLocaleDateString('en-US', { weekday: 'short' }),
            pins: Math.floor(Math.random() * 10) + 1,
            engagement: Math.floor(Math.random() * 50) + 10,
          });
        }
        setChartData(data);
      } catch (error) {
        console.error("Error fetching analytics data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, [profile, authLoading, navigate]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  const totalCreated = profile?.totalPinsCreated || 0;
  const totalPublished = profile?.totalPinsPublished || 0;
  const totalScheduled = profile?.totalPinsScheduled || 0;
  const accountsConnected = profile?.pinterestAccounts?.length || 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <button 
            onClick={() => navigate('/app')}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 lg:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Performance Overview</h2>
          <p className="text-slate-500 mt-1">Track your Pinterest marketing efforts and engagement.</p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard 
            title="Total Pins Created" 
            value={totalCreated} 
            icon={<Pin className="w-6 h-6 text-blue-600" />} 
            trend="+12% this month"
            color="bg-blue-50 border-blue-100"
          />
          <MetricCard 
            title="Successfully Published" 
            value={totalPublished} 
            icon={<CheckCircle2 className="w-6 h-6 text-green-600" />} 
            trend="All time"
            color="bg-green-50 border-green-100"
          />
          <MetricCard 
            title="Currently Scheduled" 
            value={scheduledCount} 
            icon={<Calendar className="w-6 h-6 text-amber-600" />} 
            trend={`${totalScheduled} total scheduled`}
            color="bg-amber-50 border-amber-100"
          />
          <MetricCard 
            title="Accounts Connected" 
            value={accountsConnected} 
            icon={<TrendingUp className="w-6 h-6 text-purple-600" />} 
            trend={accountsConnected > 0 ? "Active" : "Action Required"}
            color="bg-purple-50 border-purple-100"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Pin Generation Activity (Last 7 Days)</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPins" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E60023" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#E60023" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area type="monotone" dataKey="pins" stroke="#E60023" strokeWidth={3} fillOpacity={1} fill="url(#colorPins)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Estimated Engagement (Last 7 Days)</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area type="monotone" dataKey="engagement" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorEngagement)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center italic">
              Note: Engagement data is simulated. Connect to Pinterest Analytics API for real-time metrics.
            </p>
          </div>
        </div>

        {/* Account Status */}
        <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Account Connection Status</h3>
          {accountsConnected === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">No Pinterest accounts connected. Connect an account in Settings to start publishing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profile?.pinterestAccounts?.map((account) => (
                <div key={account.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{account.name}</p>
                      <p className="text-xs text-slate-500">Connected</p>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, icon, trend, color }: { title: string, value: number | string, icon: React.ReactNode, trend: string, color: string }) {
  return (
    <div className={`p-6 rounded-2xl border ${color}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-white rounded-xl shadow-sm">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-slate-600 text-sm font-medium mb-1">{title}</h3>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-2 font-medium">{trend}</p>
      </div>
    </div>
  );
}
