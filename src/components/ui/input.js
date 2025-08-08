// src/components/ui/input.js
import React from 'react';
export function Input(props) {
  return <input {...props} className={`border rounded px-2 py-1 ${props.className||''}`} />;
}
