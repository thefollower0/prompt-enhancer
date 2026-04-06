import { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Sparkles, Copy, Check, Loader2, Wand2, Save, Braces, Bookmark, Trash2, X, History, Clock, RotateCcw, Target, Share2, Link } from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

interface Template {
  id: string;
  name: string;
  prompt: string;
  context: string;
  seoIntent?: string;
}

interface HistoryItem {
  id: string;
  timestamp: number;
  originalPrompt: string;
  context: string;
  variableValues: Record<string, string>;
  result: { enhancedPrompt: string; explanation: string };
  seoIntent?: string;
}

const SEO_INTENTS = [
  { id: 'Informational', label: 'Informational', description: 'Learning or finding answers' },
  { id: 'Navigational', label: 'Navigational', description: 'Looking for a specific site/page' },
  { id: 'Commercial', label: 'Commercial', description: 'Researching before a purchase' },
  { id: 'Transactional', label: 'Transactional', description: 'Ready to buy or take action' }
];

const EXAMPLES = [
  {
    prompt: "Write a blog post about {{topic}}.",
    context: "Target audience is {{audience}}. Tone should be encouraging and practical. Include a listicle format."
  },
  {
    prompt: "Explain {{concept}}.",
    context: "Explain it to a 10-year-old using simple analogies. Keep it under 3 paragraphs."
  },
  {
    prompt: "Write a python script to scrape {{website}}.",
    context: "Use BeautifulSoup and requests. Include error handling and comments explaining the code."
  }
];

const extractVariables = (text: string) => {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  return Array.from(new Set(matches));
};

export default function App() {
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [context, setContext] = useState('');
  const [seoIntent, setSeoIntent] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [result, setResult] = useState<{ enhancedPrompt: string; explanation: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Share State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareWithContext, setShareWithContext] = useState(true);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Template State
  const [templates, setTemplates] = useState<Template[]>(() => {
    try {
      const saved = localStorage.getItem('prompt-templates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('prompt-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('prompt-templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem('prompt-history', JSON.stringify(history));
  }, [history]);

  // Parse share link on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareParam = params.get('share');
    if (shareParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(shareParam)));
        if (decoded.ep) {
          setResult({ enhancedPrompt: decoded.ep, explanation: decoded.ex || '' });
        }
        if (decoded.op) setOriginalPrompt(decoded.op);
        if (decoded.cx) setContext(decoded.cx);
        if (decoded.si) setSeoIntent(decoded.si);
        if (decoded.vv) setVariableValues(decoded.vv);
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error("Failed to parse share link", e);
      }
    }
  }, []);

  const currentVariables = Array.from(new Set([
    ...extractVariables(originalPrompt),
    ...extractVariables(context)
  ]));

  const handleEnhance = async () => {
    if (!originalPrompt.trim()) {
      setError('Please enter a prompt to enhance.');
      return;
    }

    setIsEnhancing(true);
    setError('');
    setResult(null);

    // Resolve variables
    let resolvedPrompt = originalPrompt;
    let resolvedContext = context;
    
    currentVariables.forEach(v => {
      const val = variableValues[v] || `[${v}]`;
      const regex = new RegExp(`\\{\\{${v}\\}\\}`, 'g');
      resolvedPrompt = resolvedPrompt.replace(regex, val);
      resolvedContext = resolvedContext.replace(regex, val);
    });

    let finalContext = resolvedContext || 'Make it a highly effective and clear prompt.';
    if (seoIntent) {
      finalContext += `\n\nSEO Search Intent: ${seoIntent}. Please optimize the prompt to ensure the generated content perfectly aligns with this specific search intent.`;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Original Prompt:\n${resolvedPrompt}\n\nUser's Goals/Context:\n${finalContext}`,
        config: {
          systemInstruction: 'You are an expert prompt engineer. Your task is to take a user\'s original prompt and their specific goals or context, and rewrite the prompt to be highly effective, clear, detailed, and optimized for Large Language Models. Return a JSON object with two fields: "enhancedPrompt" (the rewritten prompt) and "explanation" (a brief explanation of what you changed and why).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              enhancedPrompt: {
                type: Type.STRING,
                description: 'The optimized and enhanced version of the original prompt.',
              },
              explanation: {
                type: Type.STRING,
                description: 'A brief explanation of the improvements made to the prompt.',
              },
            },
            required: ['enhancedPrompt', 'explanation'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        setResult(parsed);
        
        // Add to history
        const newHistoryItem: HistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          originalPrompt,
          context,
          variableValues: { ...variableValues },
          result: parsed,
          seoIntent
        };
        setHistory(prev => [newHistoryItem, ...prev].slice(0, 50)); // Keep last 50
      } else {
        setError('Failed to generate enhanced prompt. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while enhancing the prompt.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleCopy = () => {
    if (result?.enhancedPrompt) {
      navigator.clipboard.writeText(result.enhancedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) return;
    const newTemplate: Template = {
      id: Date.now().toString(),
      name: newTemplateName.trim(),
      prompt: originalPrompt,
      context: context,
      seoIntent: seoIntent
    };
    setTemplates(prev => [...prev, newTemplate]);
    setIsSavingTemplate(false);
    setNewTemplateName('');
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleRestore = (item: HistoryItem) => {
    setOriginalPrompt(item.originalPrompt);
    setContext(item.context);
    setVariableValues(item.variableValues);
    setResult(item.result);
    setSeoIntent(item.seoIntent || '');
    setIsHistoryModalOpen(false);
  };

  const getShareLink = () => {
    if (!result) return '';
    const data: any = { ep: result.enhancedPrompt, ex: result.explanation };
    if (shareWithContext) {
      data.op = originalPrompt;
      data.cx = context;
      data.si = seoIntent;
      data.vv = variableValues;
    }
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    return `${window.location.origin}${window.location.pathname}?share=${encoded}`;
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(getShareLink());
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Wand2 className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Prompt Enhancer</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-end mb-1">
                <h2 className="text-lg font-medium text-slate-900">Original Prompt</h2>
                <button 
                  onClick={() => setIsSavingTemplate(true)}
                  disabled={!originalPrompt.trim()}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 flex items-center gap-1 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> Save as Template
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-3">Enter the basic prompt. Use <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">{"{{variable}}"}</code> for dynamic values.</p>
              <textarea
                value={originalPrompt}
                onChange={(e) => setOriginalPrompt(e.target.value)}
                placeholder="e.g., Write a blog post about {{topic}}."
                className="w-full h-40 p-4 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-shadow font-mono text-sm"
              />
            </div>

            <div>
              <h2 className="text-lg font-medium text-slate-900 mb-1">Goals & Context <span className="text-slate-400 text-sm font-normal">(Optional)</span></h2>
              <p className="text-sm text-slate-500 mb-3">What are you trying to achieve? Variables work here too.</p>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g., Target audience is {{audience}}."
                className="w-full h-24 p-4 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-shadow font-mono text-sm"
              />
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-900 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-500" /> SEO Search Intent <span className="text-slate-400 font-normal">(Optional)</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {SEO_INTENTS.map((intent) => (
                  <button
                    key={intent.id}
                    onClick={() => setSeoIntent(seoIntent === intent.id ? '' : intent.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      seoIntent === intent.id 
                        ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' 
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`text-sm font-medium ${seoIntent === intent.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {intent.label}
                    </div>
                    <div className={`text-xs mt-0.5 ${seoIntent === intent.id ? 'text-indigo-700' : 'text-slate-500'}`}>
                      {intent.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {currentVariables.length > 0 && (
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
                <h3 className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                  <Braces className="w-4 h-4" /> Dynamic Values
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentVariables.map(v => (
                    <div key={v}>
                      <label className="block text-xs font-medium text-indigo-700 mb-1 capitalize">{v.replace(/_/g, ' ')}</label>
                      <input
                        type="text"
                        value={variableValues[v] || ''}
                        onChange={e => setVariableValues(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`Enter ${v}`}
                        className="w-full p-2 text-sm bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}

            <button
              onClick={handleEnhance}
              disabled={isEnhancing || !originalPrompt.trim()}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl font-medium shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isEnhancing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Enhancing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Enhance Prompt
                </>
              )}
            </button>

            {/* Saved Templates */}
            {templates.length > 0 && (
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Bookmark className="w-4 h-4" /> Saved Templates
                </h3>
                <div className="flex flex-col gap-2">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="group relative text-left px-4 py-3 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl text-sm text-slate-600 transition-colors cursor-pointer flex flex-col gap-1"
                      onClick={() => {
                        setOriginalPrompt(t.prompt);
                        setContext(t.context);
                        setSeoIntent(t.seoIntent || '');
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-slate-800">{t.name}</span>
                        <button 
                          onClick={(e) => handleDeleteTemplate(t.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="text-slate-500 text-xs line-clamp-1 font-mono">{t.prompt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Examples */}
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Try an example:</h3>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setOriginalPrompt(ex.prompt);
                      setContext(ex.context);
                      setSeoIntent('');
                    }}
                    className="text-left px-4 py-3 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl text-sm text-slate-600 transition-colors flex flex-col gap-1"
                  >
                    <span className="font-medium text-slate-800 font-mono text-xs">{ex.prompt}</span>
                    <span className="text-slate-500 text-xs line-clamp-1">{ex.context}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-end mb-1">
                <h2 className="text-lg font-medium text-slate-900">Enhanced Result</h2>
                {history.length > 0 && (
                  <button 
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                  >
                    <History className="w-3.5 h-3.5" /> Version History
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-3">Your optimized prompt will appear here.</p>
            </div>
            
            <div className={`relative w-full min-h-[500px] bg-white border rounded-xl shadow-sm overflow-hidden transition-colors flex flex-col ${result ? 'border-indigo-200' : 'border-slate-200'}`}>
              {!result && !isEnhancing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <Wand2 className="w-12 h-12 mb-4 opacity-20" />
                  <p>Enter your prompt and click enhance to see the magic.</p>
                </div>
              )}

              {isEnhancing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-500 bg-white/80 backdrop-blur-sm z-10">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                  <p className="font-medium animate-pulse">Crafting the perfect prompt...</p>
                </div>
              )}

              {result && (
                <>
                  <div className="p-6 flex-grow overflow-y-auto">
                    <div className="prose prose-slate max-w-none">
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed font-medium">
                        {result.enhancedPrompt}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-6 border-t border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      Why this works
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {result.explanation}
                    </p>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-2">
                    <button
                      onClick={() => setIsShareModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Prompt
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Save Template Modal */}
      {isSavingTemplate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Save Template</h3>
              <button 
                onClick={() => setIsSavingTemplate(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Template Name
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Blog Post Generator"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTemplate();
                  if (e.key === 'Escape') setIsSavingTemplate(false);
                }}
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsSavingTemplate(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!newTemplateName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" /> Version History
              </h3>
              <div className="flex items-center gap-4">
                {history.length > 0 && (
                  <button 
                    onClick={() => setHistory([])}
                    className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-slate-50/50">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-8">No history yet.</div>
              ) : (
                <div className="space-y-4">
                  {history.map(item => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.timestamp).toLocaleString()}
                        </div>
                        <button
                          onClick={() => handleRestore(item)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-1">Original</h4>
                          <p className="text-sm text-slate-600 line-clamp-3 font-mono text-xs bg-slate-50 p-2 rounded border border-slate-100">{item.originalPrompt}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-1">Enhanced</h4>
                          <p className="text-sm text-slate-600 line-clamp-3 bg-slate-50 p-2 rounded border border-slate-100">{item.result.enhancedPrompt}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600" /> Share Prompt
              </h3>
              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={shareWithContext}
                  onChange={(e) => setShareWithContext(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-900">Include Context & Inputs</span>
                  <span className="text-xs text-slate-500">Share the original prompt and your goals too.</span>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Share Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getShareLink()}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none font-mono"
                  />
                  <button
                    onClick={handleCopyShareLink}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    {shareLinkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {shareLinkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
