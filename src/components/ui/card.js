// src/components/ui/card.js
import React from 'react';
export function Card({ children, className = '' }) {
  return <div className={`border rounded shadow ${className}`}>{children}</div>;
}
export function CardContent({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}