import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, Calculator, Info } from 'lucide-react';

export interface CalculationStep {
  equation: string;
  variableDefinitions: { symbol: string; name: string; value: string; unit: string }[];
  substitution: string;
  result: string;
  unit: string;
  engineeringInterpretation: string;
}

interface TheoryPanelProps {
  title: string;
  conceptSummary: string;
  steps: CalculationStep[];
  defaultOpen?: boolean;
}

export const TheoryCalculationsPanel: React.FC<TheoryPanelProps> = ({
  title,
  conceptSummary,
  steps,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-[#E8E3EF] rounded-xl overflow-hidden shadow-xs">
      {/* Header bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-[#F8F7FB] hover:bg-[#F1EBFA]/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#F1EBFA] rounded-md text-[#7045B8]">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#24212C]">Theory & Calculations: {title}</h4>
            <p className="text-xs text-[#77717F]">Exact governing equations, dynamic parameter substitution & interpretation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#7045B8]">
            {isOpen ? 'Collapse' : 'Expand Equations'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[#7045B8]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#7045B8]" />
          )}
        </div>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-4 space-y-4 border-t border-[#E8E3EF]">
          {/* Concept summary callout */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#F1EBFA]/50 border border-[#7045B8]/20 text-xs text-[#4B287F]">
            <BookOpen className="w-4 h-4 text-[#7045B8] shrink-0 mt-0.5" />
            <p className="leading-relaxed">{conceptSummary}</p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {steps.map((st, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-[#FDFDFE] border border-[#E8E3EF] rounded-lg space-y-3"
              >
                {/* Equation */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-1 border-b border-[#F1EBFA]">
                  <span className="text-xs font-bold text-[#4B287F] shrink-0">
                    Step {idx + 1}. Mathematical Model
                  </span>
                  <div className="px-3 py-1.5 bg-[#F1EBFA] rounded-md font-mono text-xs font-semibold text-[#4B287F] max-w-full overflow-x-auto">
                    {st.equation}
                  </div>
                </div>

                {/* Variables Definition Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E8E3EF] text-[#77717F]">
                        <th className="py-1 px-2 font-medium">Variable</th>
                        <th className="py-1 px-2 font-medium">Definition</th>
                        <th className="py-1 px-2 font-medium">Active Value</th>
                        <th className="py-1 px-2 font-medium">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1EBFA] font-mono text-[11px]">
                      {st.variableDefinitions.map((vd, vIdx) => (
                        <tr key={vIdx} className="hover:bg-[#F8F7FB]">
                          <td className="py-1 px-2 font-semibold text-[#7045B8]">{vd.symbol}</td>
                          <td className="py-1 px-2 font-sans text-[#24212C]">{vd.name}</td>
                          <td className="py-1 px-2 text-[#4B287F] font-bold">{vd.value}</td>
                          <td className="py-1 px-2 text-[#77717F]">{vd.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Substitution & Result */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 bg-[#F8F7FB] rounded-md border border-[#E8E3EF]">
                    <span className="block text-[11px] font-medium text-[#77717F] mb-1">
                      Step-by-step Substitution:
                    </span>
                    <span className="font-mono text-xs text-[#24212C] break-all">
                      {st.substitution}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#F1EBFA] rounded-md border border-[#7045B8]/20 flex items-center justify-between">
                    <div>
                      <span className="block text-[11px] font-medium text-[#4B287F]">
                        Computed Result:
                      </span>
                      <span className="font-mono text-base font-bold text-[#4B287F]">
                        {st.result} <span className="text-xs font-normal">{st.unit}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Engineering Interpretation */}
                <div className="flex items-start gap-2 pt-1 text-xs text-[#77717F]">
                  <Info className="w-3.5 h-3.5 text-[#7045B8] shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-[#24212C]">Engineering Interpretation:</strong>{' '}
                    {st.engineeringInterpretation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
