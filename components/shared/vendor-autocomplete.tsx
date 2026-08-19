'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useReceipts } from '@/hooks/use-receipts';

interface VendorAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

/**
 * Vendor autocomplete input with type-ahead filtering.
 * Shows vendors from user's receipt history, sorted by most recent.
 * Allows custom entry for new vendors.
 */
export function VendorAutocomplete({
  value,
  onChange,
  placeholder = 'e.g., Checkers, KFC, Netflix',
  className = '',
  required = false,
}: VendorAutocompleteProps) {
  const { receipts } = useReceipts();
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract unique vendors from receipts, sorted by most recent
  const vendorHistory = useMemo(() => {
    if (!receipts) return [];

    const vendorMap = new Map<string, number>();

    receipts.forEach((receipt) => {
      if (receipt.vendor) {
        const vendor = receipt.vendor.trim();
        const timestamp = receipt.capturedAt?.toMillis?.() ?? 0;

        // Keep most recent timestamp for each vendor
        if (!vendorMap.has(vendor) || vendorMap.get(vendor)! < timestamp) {
          vendorMap.set(vendor, timestamp);
        }
      }
    });

    // Sort by most recent
    return Array.from(vendorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([vendor]) => vendor);
  }, [receipts]);

  // Filter vendors based on input
  const filteredVendors = useMemo(() => {
    if (!inputValue.trim()) return vendorHistory.slice(0, 10);

    const searchTerm = inputValue.toLowerCase();
    return vendorHistory
      .filter((vendor) => vendor.toLowerCase().includes(searchTerm))
      .slice(0, 10);
  }, [vendorHistory, inputValue]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setShowDropdown(true);
  };

  // Handle vendor selection from dropdown
  const handleSelect = (vendor: string) => {
    setInputValue(vendor);
    onChange(vendor);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
      />

      {/* Dropdown */}
      {showDropdown && filteredVendors.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {filteredVendors.map((vendor) => (
            <button
              key={vendor}
              type="button"
              onClick={() => handleSelect(vendor)}
              className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-primary/10 transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              {vendor}
            </button>
          ))}
        </div>
      )}

      {/* Show hint when no vendors in history yet */}
      {showDropdown && vendorHistory.length === 0 && inputValue === '' && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-lg shadow-lg px-4 py-3"
        >
          <p className="text-sm text-text-secondary">
            No vendor history yet. Type to add a new vendor.
          </p>
        </div>
      )}
    </div>
  );
}
