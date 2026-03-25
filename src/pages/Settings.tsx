import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Key, Save, Loader2, AlertCircle, Check, ArrowLeft, Clock, Calendar, X } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function Settings() {
  const { profile, updateProfileData } = useAuth();
  const navigate = useNavigate();
  
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [scheduledPins, setScheduledPins] = useState<any[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);

  useEffect(() => {
    if (profile?.geminiApiKey) {
      setApiKey(profile.geminiApiKey);
    }
  }, [profile]);

  useEffect(() => {
    const fetchAllScheduledPins = async () => {
      if (!profile?.uid || !profile?.pinterestAccounts || profile.pinterestAccounts.length === 0) return;
      
      setLoadingPins(true);
      try {
        let allPins: any[] = [];
        
        const q = query(collection(db, 'users', profile.uid, 'scheduledPins'));
        const snapshot = await getDocs(q);
        const pins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const now = Date.now();
        const futurePins = pins.filter((p: any) => p.publishAt > now);
        
        // Clean up past pins
        const pastPins = pins.filter((p: any) => p.publishAt <= now);
        for (const p of pastPins) {
          try {
            await deleteDoc(doc(db, 'users', profile.uid, 'scheduledPins', p.id));
          } catch (e) {
            console.error("Failed to clean up past scheduled pin", e);
          }
        }
        
        // Map account details
        allPins = futurePins.map((p: any) => {
          const account = profile.pinterestAccounts.find((acc: any) => acc.token === p.token);
          return {
            ...p,
            accountName: account ? account.name : 'Unknown Account',
            accountId: account ? account.id : '',
            token: p.token
          };
        });
        
        // Sort by publishAt date
        allPins.sort((a, b) => a.publishAt - b.publishAt);
        setScheduledPins(allPins);
      } catch (e) {
        console.error("Failed to fetch scheduled pins", e);
      } finally {
        setLoadingPins(false);
      }
    };

    fetchAllScheduledPins();
  }, [profile?.pinterestAccounts]);

  const deleteScheduledPin = async (id: string, token: string) => {
    if (!profile?.uid) return;
    try {
      const pin = scheduledPins.find(p => p.id === id);
      if (pin && pin.pinId) {
        // Delete from Pinterest
        await fetch(`/api/social/pins/${pin.pinId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      
      await deleteDoc(doc(db, 'users', profile.uid, 'scheduledPins', id));
      setScheduledPins(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error("Failed to delete scheduled pin", e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      await updateProfileData({ geminiApiKey: apiKey });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to App
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8">
          {/* Left Column: Settings */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-fit">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
              <div className="bg-slate-200 p-2 rounded-lg">
                <SettingsIcon className="w-5 h-5 text-slate-700" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Settings</h1>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              {success && (
                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Settings saved successfully!</span>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                  <Key className="w-4 h-4" /> Gemini API Key
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Provide your own Google Gemini API key to generate pins. This key is stored securely in your profile.
                </p>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none font-mono text-sm"
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSave}
                  disabled={loading}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-70"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Settings
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Scheduled Pins */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-fit">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
              <div className="bg-slate-200 p-2 rounded-lg">
                <Clock className="w-5 h-5 text-slate-700" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">My Scheduled Pins</h2>
            </div>
            <div className="p-6">
              {loadingPins ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              ) : scheduledPins.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                  <p>No pins scheduled.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduledPins.map(pin => (
                    <div key={pin.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                      <div>
                        <h3 className="font-bold text-slate-900">{pin.title || 'Untitled Pin'}</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          Scheduled for: {new Date(pin.publishAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Account: {pin.accountName}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteScheduledPin(pin.id, pin.token)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Cancel Scheduled Pin"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
