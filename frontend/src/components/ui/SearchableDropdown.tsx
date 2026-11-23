import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, X, Check, Plus } from 'lucide-react'

export interface DropdownItem {
  id: string
  name: string
  subtitle?: string
  badge?: string
}

export interface SearchableDropdownProps {
  label: string
  value: string
  onChange: (value: string) => void
  items?: DropdownItem[]
  options?: DropdownItem[]
  placeholder?: string
  isLoading?: boolean
  disabled?: boolean
  required?: boolean
  labelRight?: React.ReactNode
  labelClassName?: string
  buttonClassName?: string
  error?: string
  onQuickAdd?: () => void
  quickAddLabel?: string
  className?: string
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  label,
  value,
  onChange,
  items,
  options,
  placeholder = 'Select...',
  isLoading = false,
  disabled = false,
  required = false,
  labelRight,
  labelClassName,
  buttonClassName,
  error,
  onQuickAdd,
  quickAddLabel = '+ Quick Add',
  className = ''
}) => {
  const dropdownItems = useMemo(() => items || options || [], [items, options])
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  const filteredItems = useMemo(() => {
    if (!searchTerm) return dropdownItems
    const lowerSearch = searchTerm.toLowerCase()
    return dropdownItems.filter(item => {
      const matchName = item.name.toLowerCase().includes(lowerSearch)
      const matchSub = item.subtitle ? item.subtitle.toLowerCase().includes(lowerSearch) : false
      const matchBadge = item.badge ? item.badge.toLowerCase().includes(lowerSearch) : false
      return matchName || matchSub || matchBadge
    })
  }, [dropdownItems, searchTerm])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredItems])

  const selectedItem = dropdownItems.find(item => item.id === value)

  const handleSelect = (id: string) => {
    onChange(id)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSearchTerm('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev))
      scrollIntoView(highlightedIndex + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0))
      scrollIntoView(highlightedIndex - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredItems[highlightedIndex]) {
        handleSelect(filteredItems[highlightedIndex].id)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  const scrollIntoView = (index: number) => {
    if (!listRef.current) return
    const buttons = listRef.current.querySelectorAll('button[data-item-index]')
    if (buttons[index]) {
      (buttons[index] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 text-left ${className}`} ref={containerRef}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className={labelClassName || "text-xs font-semibold text-gray-700"}>
          {label.replace(/\s*\*+\s*$/, '').trim()} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex items-center gap-2">
          {labelRight}
          {onQuickAdd && !labelRight && (
            <button
              type="button"
              onClick={onQuickAdd}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 hover:underline transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>{quickAddLabel.replace(/^\s*\++\s*/, '').trim()}</span>
            </button>
          )}
        </div>
      </div>
      
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsOpen(!isOpen)
              if (!isOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 50)
              }
            }
          }}
          onKeyDown={handleKeyDown}
          className={`w-full min-h-[40px] px-3 py-2 bg-white border rounded-[10px] text-left text-sm flex items-center justify-between transition-colors
            ${isOpen ? 'border-[#12A89A] ring-2 ring-[#12A89A]/20' : error ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 hover:border-gray-300'}
            ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'text-gray-900 cursor-pointer'}
            ${buttonClassName || ''}
          `}
        >
          <div className="flex flex-col truncate pr-2">
            <span className={`block truncate ${!selectedItem ? 'text-gray-400' : 'font-medium text-gray-900'}`}>
              {selectedItem ? selectedItem.name : placeholder}
            </span>
            {selectedItem?.subtitle && (
              <span className="text-[11px] text-gray-500 truncate mt-0.5">
                {selectedItem.subtitle}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedItem?.badge && (
              <span className="px-2 py-0.5 bg-[#E6F6F4] text-[#0B7A70] border border-[#B8E6E0] rounded text-[10px] font-bold">
                {selectedItem.badge}
              </span>
            )}
            {selectedItem && !disabled && (
              <div
                onClick={handleClear}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </div>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-[10px] shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full h-9 pl-9 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-[8px] focus:outline-none focus:border-[#12A89A] focus:bg-white transition-colors"
                />
              </div>
            </div>
            
            <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#12A89A] border-t-transparent rounded-full animate-spin" />
                  <span>Loading records...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-4 text-center">
                  <div className="text-xs text-gray-500 mb-2">
                    {searchTerm ? `No matches found for "${searchTerm}".` : 'No records available.'}
                  </div>
                  {onQuickAdd && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false)
                        onQuickAdd()
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E6F6F4] hover:bg-[#B8E6E0]/40 text-[#0B7A70] border border-[#B8E6E0] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{quickAddLabel}</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredItems.map((item, idx) => (
                  <button
                    key={item.id}
                    data-item-index={idx}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left rounded-[6px] transition-colors
                      ${idx === highlightedIndex ? 'bg-[#E6F6F4] text-[#05303B]' : 'hover:bg-gray-50 text-gray-900'}
                    `}
                  >
                    <div className="flex flex-col truncate pr-3">
                      <div className="flex items-center gap-2 truncate">
                        <span className={`truncate font-medium ${value === item.id ? 'text-[#0B7A70] font-bold' : ''}`}>
                          {item.name}
                        </span>
                        {item.badge && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <span className="text-[11px] text-gray-500 truncate mt-0.5">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                    {value === item.id && <Check className="w-4 h-4 text-[#0B7A70] shrink-0" />}
                  </button>
                ))
              )}
            </div>

            {onQuickAdd && filteredItems.length > 0 && (
              <div className="p-2 border-t border-gray-100 bg-gray-50/70 rounded-b-[9px]">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    onQuickAdd()
                  }}
                  className="w-full py-1.5 px-3 flex items-center justify-center gap-1.5 text-xs font-bold text-[#0B7A70] bg-[#E6F6F4] hover:bg-[#B8E6E0]/40 border border-[#B8E6E0] rounded-md transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{quickAddLabel}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {error && (
        <span className="text-[10px] font-semibold text-rose-600 select-none">
          {error}
        </span>
      )}
    </div>
  )
}
