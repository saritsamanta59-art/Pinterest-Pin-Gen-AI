import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, UserProfile } from '../contexts/AuthContext';
import { ArrowLeft, Users, Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';

export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate('/app');
      return;
    }

    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData: UserProfile[] = [];
        querySnapshot.forEach((doc) => {
          usersData.push(doc.data() as UserProfile);
        });
        setUsers(usersData);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isAdmin, authLoading, navigate]);

  const handleUpdateUser = async (userId: string, updates: any) => {
    setSavingId(userId);
    setError('');
    setSuccess('');
    try {
      await updateDoc(doc(db, 'users', userId), updates);
      
      // Clean up local state (remove FieldValue objects)
      const localUpdates = { ...updates };
      if (localUpdates.maxPinterestAccounts?.isEqual) delete localUpdates.maxPinterestAccounts;
      if (localUpdates.maxPinsPerMonth?.isEqual) delete localUpdates.maxPinsPerMonth;
      
      setUsers(users.map(u => {
        if (u.uid === userId) {
          const newUser = { ...u, ...localUpdates };
          if (updates.maxPinterestAccounts?.isEqual) delete newUser.maxPinterestAccounts;
          if (updates.maxPinsPerMonth?.isEqual) delete newUser.maxPinsPerMonth;
          return newUser;
        }
        return u;
      }));
      
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSavingId(null);
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;
  }

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
            <Users className="w-5 h-5 text-red-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Registered Users ({users.length})</h2>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-2 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 text-green-700 p-4 rounded-xl text-sm flex items-center gap-2 border border-green-100">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4">Max Pinterest Accounts</th>
                  <th className="px-6 py-4">Max Pins / Month</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <UserRow 
                    key={user.uid} 
                    user={user} 
                    onSave={(updates) => handleUpdateUser(user.uid, updates)}
                    isSaving={savingId === user.uid}
                  />
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function UserRow({ user, onSave, isSaving }: { user: UserProfile, onSave: (updates: Partial<UserProfile>) => void, isSaving: boolean }) {
  const [maxAccounts, setMaxAccounts] = useState(user.maxPinterestAccounts?.toString() || '');
  const [maxPins, setMaxPins] = useState(user.maxPinsPerMonth?.toString() || '');

  const handleSave = () => {
    const updates: Partial<UserProfile> | any = {};
    if (maxAccounts !== '') updates.maxPinterestAccounts = parseInt(maxAccounts, 10);
    else updates.maxPinterestAccounts = deleteField();
    
    if (maxPins !== '') updates.maxPinsPerMonth = parseInt(maxPins, 10);
    else updates.maxPinsPerMonth = deleteField();

    onSave(updates);
  };

  const hasChanges = 
    (maxAccounts === '' ? undefined : parseInt(maxAccounts, 10)) !== user.maxPinterestAccounts ||
    (maxPins === '' ? undefined : parseInt(maxPins, 10)) !== user.maxPinsPerMonth;

  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="px-6 py-4">
        <div className="font-medium text-slate-900">{user.displayName || 'Anonymous'}</div>
        <div className="text-slate-500 text-xs mt-0.5">{user.email}</div>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          user.plan === 'pro' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
        }`}>
          {user.plan === 'pro' ? 'Pro' : 'Free'}
        </span>
      </td>
      <td className="px-6 py-4">
        <input 
          type="number" 
          value={maxAccounts}
          onChange={(e) => setMaxAccounts(e.target.value)}
          placeholder={user.plan === 'pro' ? '20 (default)' : '10 (default)'}
          className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
          min="0"
        />
      </td>
      <td className="px-6 py-4">
        <input 
          type="number" 
          value={maxPins}
          onChange={(e) => setMaxPins(e.target.value)}
          placeholder={user.plan === 'pro' ? 'Unlimited' : '100 (default)'}
          className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
          min="0"
        />
      </td>
      <td className="px-6 py-4 text-right">
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </td>
    </tr>
  );
}
