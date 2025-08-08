// src/components/ui/button.js
import React from 'react';
export function Button({ children, className = '', ...props }) {
  return (
    <button {...props} className={`px-3 py-1 rounded ${className}`}>
      {children}
    </button>
  );
}
