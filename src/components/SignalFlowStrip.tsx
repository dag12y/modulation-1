import React from 'react';
import { ArrowRight } from 'lucide-react';

export interface SignalBlock {
  label: string;
  detail?: string;
  active?: boolean;
}

interface SignalFlowStripProps {
  blocks: SignalBlock[];
}

export const SignalFlowStrip: React.FC<SignalFlowStripProps> = ({ blocks }) => {
  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
      {blocks.map((block, idx) => (
        <React.Fragment key={idx}>
          <div
            className={`px-2.5 py-1 rounded-md border text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              block.active
                ? 'bg-[#F1EBFA] border-[#7045B8]/40 text-[#4B287F] font-semibold'
                : 'bg-[#FAF9FD] border-[#E8E3EF] text-[#24212C] font-medium'
            }`}
          >
            <span>{block.label}</span>
            {block.detail && (
              <span className="font-mono text-[10px] text-[#77717F]">{block.detail}</span>
            )}
          </div>
          {idx < blocks.length - 1 && (
            <ArrowRight className="w-3.5 h-3.5 text-[#7045B8] shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
