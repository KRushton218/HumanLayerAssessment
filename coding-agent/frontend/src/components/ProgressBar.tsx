import React from 'react';
import type { Todo } from '../types';

interface ProgressBarProps {
  todos: Todo[];
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ todos }) => {
  const totalPoints = todos.reduce((sum, todo) => sum + (todo.points || 1), 0);
  const completedPoints = todos
    .filter(todo => todo.status === 'completed')
    .reduce((sum, todo) => sum + (todo.points || 1), 0);
  
  const progressPercentage = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
  
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600">
          Progress
        </span>
        <div className="text-xs text-slate-500">
          <span className="font-medium text-emerald-600">{completedPoints}</span>
          <span className="mx-1">/</span>
          <span className="font-medium">{totalPoints}</span>
          <span className="ml-1">points</span>
        </div>
      </div>
      
      <div className="w-full bg-slate-200 rounded-full h-2.5">
        <div 
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{Math.round(progressPercentage)}% complete</span>
        <span>{todos.filter(t => t.status === 'completed').length}/{todos.length} tasks</span>
      </div>
    </div>
  );
};