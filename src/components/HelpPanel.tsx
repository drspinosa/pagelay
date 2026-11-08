/**
 * @license
 * SPDX-License-Identifier: MIT
 *
 * PageLay — Integrated Help & How To Panel (Version 1)
 *
 * - Desktop & Laptop (`lg+`): Docked right-side scrollable panel (~352 px wide),
 *   visually consistent with PropertiesPanel and mutually exclusive with it.
 * - Phone & Tablet (`< 1024px`): Full-screen responsive in-app view with touch scrolling
 *   and prominent Back / Close actions that return to the editor without altering state.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers,
  LifeBuoy,
  PenTool,
  RotateCcw,
  Search,
  Smartphone,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  ALL_HELP_ARTICLES,
  getHelpArticleById,
  getHelpSectionById,
  HELP_SECTIONS,
  HelpArticle,
  HelpCalloutNote,
  HelpSection,
  HelpSectionId,
  searchHelpArticles,
} from '../content/helpContent';

interface HelpPanelProps {
  onClose: () => void;
}

const SECTION_ICONS: Record<
  HelpSectionId,
  React.ComponentType<{ className?: string }>
> = {
  'getting-started': BookOpen,
  'pages-and-layout': Layers,
  'drawing-tools': PenTool,
  'precision-and-snapping': Compass,
  'images-and-objects': ImageIcon,
  'opening-and-saving': FolderOpen,
  'recovery-and-undo': RotateCcw,
  exporting: Download,
  'mobile-and-keyboard-controls': Smartphone,
  troubleshooting: LifeBuoy,
};

const QUICK_SEARCH_SUGGESTIONS = [
  'Save & Open Recent',
  'Import pages',
  'Guidelines & 1 mm',
  'Crop & DPI',
  'Precision Mode',
  'Export PDF',
  'Shortcuts',
] as const;

export const HelpPanel: React.FC<HelpPanelProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSectionIds, setExpandedSectionIds] = useState<HelpSectionId[]>([
    'getting-started',
    'opening-and-saving',
  ]);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [openedFromSearch, setOpenedFromSearch] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  const searchResults = useMemo(
    () => (isSearching ? searchHelpArticles(trimmedQuery) : []),
    [isSearching, trimmedQuery]
  );

  const activeArticle: HelpArticle | undefined = useMemo(
    () => (activeArticleId ? getHelpArticleById(activeArticleId) : undefined),
    [activeArticleId]
  );

  const activeSection: HelpSection | undefined = useMemo(
    () =>
      activeArticle ? getHelpSectionById(activeArticle.sectionId) : undefined,
    [activeArticle]
  );

  // Previous / Next article navigation within the manual
  const { prevArticle, nextArticle } = useMemo(() => {
    if (!activeArticle) return { prevArticle: undefined, nextArticle: undefined };
    const idx = ALL_HELP_ARTICLES.findIndex((a) => a.id === activeArticle.id);
    if (idx === -1) return { prevArticle: undefined, nextArticle: undefined };
    return {
      prevArticle: idx > 0 ? ALL_HELP_ARTICLES[idx - 1] : undefined,
      nextArticle:
        idx < ALL_HELP_ARTICLES.length - 1
          ? ALL_HELP_ARTICLES[idx + 1]
          : undefined,
    };
  }, [activeArticle]);

  // Reset scroll position to the top when switching between topic list and an individual article
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeArticleId]);

  const toggleSection = (sectionId: HelpSectionId) => {
    setExpandedSectionIds((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const expandAllSections = () => {
    setExpandedSectionIds(HELP_SECTIONS.map((s) => s.id));
  };

  const collapseAllSections = () => {
    setExpandedSectionIds([]);
  };

  const openArticle = (article: HelpArticle, fromSearch: boolean) => {
    setActiveArticleId(article.id);
    setOpenedFromSearch(fromSearch);
    setExpandedSectionIds((prev) =>
      prev.includes(article.sectionId) ? prev : [...prev, article.sectionId]
    );
  };

  const handleBackFromArticle = () => {
    setActiveArticleId(null);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (openedFromSearch) {
      setActiveArticleId(null);
      setOpenedFromSearch(false);
    }
    searchInputRef.current?.focus();
  };

  const renderCallout = (callout: HelpCalloutNote, index: number) => {
    if (callout.type === 'important') {
      return (
        <div
          key={index}
          className="p-3 rounded-lg bg-amber-50/90 border border-amber-200/90 text-amber-950 space-y-1"
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{callout.title || 'Important'}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-900/95">
            {callout.text}
          </p>
        </div>
      );
    }

    if (callout.type === 'tip') {
      return (
        <div
          key={index}
          className="p-3 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-emerald-950 space-y-1"
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-emerald-900">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{callout.title || 'Tip'}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-900/90">
            {callout.text}
          </p>
        </div>
      );
    }

    return (
      <div
        key={index}
        className="p-3 rounded-lg bg-blue-50/75 border border-blue-200/80 text-slate-800 space-y-1"
      >
        <div className="flex items-center gap-1.5 font-semibold text-[11px] text-blue-900">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{callout.title || 'Note'}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-700">
          {callout.text}
        </p>
      </div>
    );
  };

  return (
    <aside
      data-sidebar="true"
      aria-label="Help and How To Manual"
      onKeyDown={(e) => {
        // Ensure keyboard interaction inside Help never leaks to canvas shortcuts
        const isSaveCombo =
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          (e.key.toLowerCase() === 's' || e.code === 'KeyS');
        if (!isSaveCombo) {
          e.stopPropagation();
        }
      }}
      className="max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:w-full max-lg:h-dvh lg:relative lg:w-[352px] lg:h-full bg-white lg:border-l border-slate-200 flex flex-col overflow-hidden touch-pan-y select-text shrink-0 z-30"
    >
      {/* Header Bar */}
      <div className="h-11 lg:h-9 px-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {activeArticle ? (
            <button
              type="button"
              onClick={handleBackFromArticle}
              className="px-2 py-1 -ml-1 rounded text-xs font-semibold text-blue-700 hover:bg-blue-50 flex items-center gap-1 transition-colors"
              title={
                openedFromSearch && isSearching
                  ? 'Back to search results'
                  : 'Back to Help topics'
              }
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>
                {openedFromSearch && isSearching ? 'Results' : 'All Topics'}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <CircleHelp className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-800 truncate">
                Help &amp; How To
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 lg:p-1 rounded-md bg-slate-200/80 lg:bg-transparent hover:bg-slate-200 text-slate-700 hover:text-slate-950 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Close Help and return to editor"
            aria-label="Close Help"
          >
            <span className="lg:hidden">Close</span>
            <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
          </button>
        </div>
      </div>

      {/* Persistent Search Bar */}
      <div className="p-2.5 sm:px-3.5 border-b border-slate-200 bg-white shrink-0 select-none">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const nextVal = e.target.value;
              setSearchQuery(nextVal);
              if (activeArticleId && nextVal.trim().length > 0) {
                setActiveArticleId(null);
              }
            }}
            onKeyDown={(e) => {
              // Prevent any editor shortcuts from firing while typing in search
              const isSaveCombo =
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                (e.key.toLowerCase() === 's' || e.code === 'KeyS');
              if (!isSaveCombo) {
                e.stopPropagation();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                if (searchQuery) {
                  setSearchQuery('');
                  if (openedFromSearch) {
                    setActiveArticleId(null);
                    setOpenedFromSearch(false);
                  }
                } else {
                  e.currentTarget.blur();
                }
              }
            }}
            placeholder="Search tools, .lay files, mm, DPI, shortcuts..."
            aria-label="Search Help and How To articles"
            className="w-full pl-8 pr-8 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none transition-colors"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-1.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Body (Article View, Search Results View, or Expandable Categories View) */}
      <div
        ref={scrollContainerRef}
        data-allow-touch-scroll="true"
        className="flex-1 overflow-y-auto overscroll-contain touch-pan-y touch-scroll-y p-3.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 text-xs"
      >
        {activeArticle && activeSection ? (
          /* ==================================================================
           * INDIVIDUAL ARTICLE VIEW
           * ================================================================== */
          <article className="space-y-4">
            {/* Breadcrumb & Section Badge */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setOpenedFromSearch(false);
                  setExpandedSectionIds((prev) =>
                    prev.includes(activeSection.id)
                      ? prev
                      : [...prev, activeSection.id]
                  );
                  setActiveArticleId(null);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[10px] transition-colors select-none"
              >
                <span className="font-mono font-semibold text-blue-600">
                  §{activeSection.number}
                </span>
                <span>{activeSection.title}</span>
              </button>

              <h2 className="text-sm font-bold text-slate-900 leading-snug">
                {activeArticle.title}
              </h2>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {activeArticle.summary}
              </p>
            </div>

            {/* Paragraphs */}
            {activeArticle.paragraphs && activeArticle.paragraphs.length > 0 && (
              <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
                {activeArticle.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}

            {/* Step-by-Step Instructions */}
            {activeArticle.steps && activeArticle.steps.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/90 space-y-2.5">
                <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider select-none">
                  Step-by-Step
                </div>
                <ol className="space-y-2">
                  {activeArticle.steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-[11px] text-slate-700 leading-relaxed"
                    >
                      <span className="w-4 h-4 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 select-none">
                        {i + 1}
                      </span>
                      <span className="flex-1">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Key Points / Bullets */}
            {activeArticle.bullets && activeArticle.bullets.length > 0 && (
              <ul className="space-y-2">
                {activeArticle.bullets.map((bullet, i) => {
                  const colonIdx = bullet.indexOf(':');
                  const hasLeadLabel = colonIdx > 0 && colonIdx < 48;
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[11px] text-slate-700 leading-relaxed"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                      <span className="flex-1">
                        {hasLeadLabel ? (
                          <>
                            <strong className="font-semibold text-slate-900">
                              {bullet.slice(0, colonIdx + 1)}
                            </strong>
                            {bullet.slice(colonIdx + 1)}
                          </>
                        ) : (
                          bullet
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Verified Shortcuts Table (if present) */}
            {activeArticle.shortcuts && activeArticle.shortcuts.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[10px] font-semibold text-slate-600 uppercase tracking-wider select-none">
                  <span>Control / Shortcut</span>
                  <span>Action</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {activeArticle.shortcuts.map((item, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 hover:bg-slate-50/80"
                    >
                      <kbd className="inline-block self-start px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px] font-semibold text-slate-800 shrink-0">
                        {item.keys}
                      </kbd>
                      <span className="text-[11px] text-slate-600 sm:text-right leading-snug">
                        {item.action}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Callouts (Tips, Notes & Important Warnings) */}
            {activeArticle.callouts && activeArticle.callouts.length > 0 && (
              <div className="space-y-2.5">
                {activeArticle.callouts.map((callout, i) =>
                  renderCallout(callout, i)
                )}
              </div>
            )}

            {/* Optional Future Illustrations Slot (only rendered if populated in future releases) */}
            {activeArticle.illustrations &&
              activeArticle.illustrations.length > 0 && (
                <div className="space-y-3 pt-1">
                  {activeArticle.illustrations.map((illus) => (
                    <figure
                      key={illus.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5"
                    >
                      <img
                        src={illus.src}
                        alt={illus.alt}
                        width={illus.width}
                        height={illus.height}
                        className="w-full h-auto rounded"
                        loading="lazy"
                      />
                      {illus.caption && (
                        <figcaption className="text-[10px] text-slate-500 text-center">
                          {illus.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}

            {/* Bottom Article Navigation (Previous / Next + Back to Topics) */}
            <div className="pt-3 border-t border-slate-200 space-y-2 select-none">
              <div className="grid grid-cols-2 gap-2">
                {prevArticle ? (
                  <button
                    type="button"
                    onClick={() => openArticle(prevArticle, false)}
                    className="p-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left flex flex-col gap-0.5 transition-colors"
                  >
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                      <ChevronLeft className="w-3 h-3" />
                      <span>Previous</span>
                    </span>
                    <span className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                      {prevArticle.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}

                {nextArticle ? (
                  <button
                    type="button"
                    onClick={() => openArticle(nextArticle, false)}
                    className="p-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-right flex flex-col items-end gap-0.5 transition-colors"
                  >
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                      <span>Next</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                    <span className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                      {nextArticle.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}
              </div>

              <button
                type="button"
                onClick={handleBackFromArticle}
                className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>
                  {openedFromSearch && isSearching
                    ? 'Back to Search Results'
                    : 'Back to All Help Topics'}
                </span>
              </button>
            </div>
          </article>
        ) : isSearching ? (
          /* ==================================================================
           * IMMEDIATE LOCAL SEARCH RESULTS VIEW
           * ================================================================== */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500 select-none">
              <span>
                {searchResults.length === 0
                  ? `No matches for "${trimmedQuery}"`
                  : `${searchResults.length} matching article${
                      searchResults.length === 1 ? '' : 's'
                    }`}
              </span>
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-blue-600 hover:underline font-medium"
              >
                Clear search
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 text-center space-y-3">
                <div className="w-8 h-8 rounded-full bg-slate-200/80 text-slate-600 flex items-center justify-center mx-auto">
                  <Search className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-slate-800 text-xs">
                    No matching help articles found
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Try searching for a tool name (such as{' '}
                    <span className="font-mono text-slate-700">dimension</span>,{' '}
                    <span className="font-mono text-slate-700">crop</span>,{' '}
                    <span className="font-mono text-slate-700">recent</span>,{' '}
                    <span className="font-mono text-slate-700">guides</span> or{' '}
                    <span className="font-mono text-slate-700">pdf</span>), or
                    pick a popular topic below:
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {QUICK_SEARCH_SUGGESTIONS.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setSearchQuery(term)}
                      className="px-2 py-1 rounded-md bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 text-[11px] font-medium transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map(({ article, section }) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => openArticle(article, true)}
                    className="w-full p-3 rounded-lg border border-slate-200 hover:border-blue-300 bg-white hover:bg-blue-50/40 text-left space-y-1 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                        <span className="font-mono font-semibold text-blue-600">
                          §{section.number}
                        </span>
                        <span>{section.title}</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="font-semibold text-xs text-slate-900 group-hover:text-blue-700">
                      {article.title}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                      {article.summary}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ==================================================================
           * DEFAULT EXPANDABLE TOPIC CATEGORIES VIEW
           * ================================================================== */
          <div className="space-y-3">
            {/* Quick Intro & Expand/Collapse Controls */}
            <div className="flex items-center justify-between gap-2 select-none">
              <span className="text-[11px] text-slate-500">
                10 sections · {ALL_HELP_ARTICLES.length} practical guides
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={expandAllSections}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Expand all
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={collapseAllSections}
                  className="text-slate-500 hover:text-slate-800 hover:underline"
                >
                  Collapse
                </button>
              </div>
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap gap-1.5 select-none">
              {QUICK_SEARCH_SUGGESTIONS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setSearchQuery(term)}
                  className="px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 hover:border-blue-200 text-[10px] font-medium transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>

            {/* 10 Expandable Sections */}
            <div className="space-y-2">
              {HELP_SECTIONS.map((section) => {
                const isExpanded = expandedSectionIds.includes(section.id);
                const SectionIcon = SECTION_ICONS[section.id] || FileText;
                return (
                  <div
                    key={section.id}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      aria-expanded={isExpanded}
                      className="w-full px-3 py-2.5 bg-slate-50/70 hover:bg-slate-100/80 flex items-start justify-between gap-2.5 text-left transition-colors select-none"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                          <SectionIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-blue-600">
                              {section.number}.
                            </span>
                            <span className="font-semibold text-xs text-slate-900 truncate">
                              {section.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                            {section.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-1">
                        <span className="font-mono text-[10px] text-slate-400">
                          {section.articles.length}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-slate-100 border-t border-slate-200/80">
                        {section.articles.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => openArticle(article, false)}
                            className="w-full px-3 py-2.5 hover:bg-blue-50/50 flex items-center justify-between gap-2 text-left transition-colors group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs text-slate-800 group-hover:text-blue-700">
                                {article.title}
                              </div>
                              <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {article.summary}
                              </div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
