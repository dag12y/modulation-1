import React, { useState } from 'react';
import {
  BookOpen,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  XCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface Scenario {
  title: string;
  question: string;
  answer: string;
  mechanism: string;
  mitigation: string;
}

interface QuizItem {
  question: string;
  options: string[];
  correctIdx: number;
  explanation: string;
}

export const TheoryLearningView: React.FC<{ onLaunchLab?: (lab: string) => void }> = ({ onLaunchLab }) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('am');
  const [userQuizAnswers, setUserQuizAnswers] = useState<Record<number, number>>({});
  const [showQuizResults, setShowQuizResults] = useState<boolean>(false);

  const whatHappensScenarios: Scenario[] = [
    {
      title: 'What happens if modulation index μ exceeds 1.0 in AM?',
      question: 'Why does an AM transmitter sound severely distorted when the audio signal is too loud?',
      mechanism:
        'When μ > 1, the carrier envelope [1 + μ m_n(t)] goes negative. A passive diode envelope detector cannot track negative envelopes and rectifies the reversed carrier phase as positive, resulting in clipped cusps and high harmonic distortion.',
      answer:
        'Overmodulation occurs. The envelope collapses past the zero baseline, creating phase reversals that destroy the message envelope and cause severe splatter into adjacent channels.',
      mitigation: 'Use an automatic gain control (AGC) or audio peak limiter before the modulator.',
    },
    {
      title: 'What happens if a DSB-SC receiver has a 90° LO phase synchronization error?',
      question: 'Why does the recovered audio completely vanish at 90 degrees phase shift?',
      mechanism:
        'Coherent detection multiplies s(t) by 2 cos(2π fc t + φ). Trigonometric expansion yields Ac Am cos(φ) m(t). Because cos(90°) = 0, the output amplitude is multiplied by zero!',
      answer:
        'Quadrature Phase Null Effect. The recovered baseband signal is completely attenuated to zero.',
      mitigation:
        'Implement a Costas Loop or squaring circuit with a Phase-Locked Loop (PLL) to lock the receiver LO phase exactly to the incoming suppressed carrier.',
    },
    {
      title: 'What happens if sampling frequency fs is below Nyquist (fs < 2 fm)?',
      question: 'What is the consequence of undersampling an analog voice signal?',
      mechanism:
        'In the frequency domain, sampling replicates the baseband spectrum at integer multiples of fs. When fs < 2 fm, the spectral replicas overlap (f_s - f_m < f_m).',
      answer:
        'Aliasing occurs. High frequency components fold over into the audible audio band as artificial, dissonant low-frequency distortion that cannot be removed by filtering.',
      mitigation:
        'Always place an analog anti-aliasing low-pass filter (cutoff ≤ fs/2) before the ADC.',
    },
    {
      title: 'What happens if FM modulation index β is increased from 0.2 to 5.0?',
      question: 'How does increasing frequency deviation affect bandwidth and audio quality?',
      mechanism:
        'Narrowband FM (β < 1) contains only a carrier and one pair of sidebands. As β increases, energy spreads across multiple higher-order Bessel sidebands J_n(β). Carson’s bandwidth widens to 2(Δf + fm).',
      answer:
        'Signal transitions from Narrowband FM to Wideband FM. Transmission bandwidth increases dramatically, but received SNR improves by up to 30 dB due to FM noise suppression (FM capture effect).',
      mitigation: 'Used in commercial FM broadcast (Δf = 75 kHz, BW ≈ 200 kHz) for high-fidelity stereo audio.',
    },
    {
      title: 'What happens if channel SNR drops to 0 dB in Digital QAM?',
      question: 'Why do higher-order constellations (64-QAM / 256-QAM) fail in noisy environments?',
      mechanism:
        'In multi-level constellations, points are spaced by small Euclidean distances d_min. When noise standard deviation σ_n approaches d_min/2, the received noisy sample crosses the decision boundary into an adjacent Voronoi region.',
      answer:
        'Constellation cloud spreads across decision boundaries. Bit Error Rate (BER) spikes toward 50%, causing complete frame loss.',
      mitigation:
        'Adaptive Modulation and Coding (AMC): The system drops down from 64-QAM to robust QPSK or BPSK when channel conditions deteriorate.',
    },
  ];

  const quizQuestions: QuizItem[] = [
    {
      question: 'In conventional Amplitude Modulation (AM) with a sinusoidal message at 100% modulation (μ = 1), what percentage of total power is carried by the sidebands?',
      options: ['100%', '66.7%', '33.3%', '50%'],
      correctIdx: 2,
      explanation: 'P_sb / P_t = (μ² / 4) / (0.5 + μ²/4). For μ = 1, P_sb = 0.25 and P_t = 0.75, yielding 0.25 / 0.75 = 33.3%. The remaining 66.7% is wasted in the carrier.',
    },
    {
      question: "According to Carson's Rule, what is the approximate RF transmission bandwidth of an FM signal with peak deviation Δf = 75 kHz and message frequency fm = 15 kHz?",
      options: ['150 kHz', '180 kHz', '90 kHz', '300 kHz'],
      correctIdx: 1,
      explanation: "Carson's Rule states BW ≈ 2(Δf + fm) = 2(75 kHz + 15 kHz) = 2(90 kHz) = 180 kHz.",
    },
    {
      question: 'Which analog modulation scheme provides the absolute minimum RF bandwidth for a message with maximum frequency fm?',
      options: ['Conventional AM', 'Double Sideband Suppressed Carrier (DSB-SC)', 'Single Sideband (SSB)', 'Frequency Modulation (FM)'],
      correctIdx: 2,
      explanation: 'SSB suppresses one entire sideband, reducing bandwidth to BW = fm. AM and DSB-SC require 2·fm, and FM requires 2(Δf + fm).',
    },
    {
      question: 'Each additional bit of resolution in a linear Pulse Code Modulation (PCM) quantizer improves the Signal-to-Quantization-Noise Ratio (SQNR) by approximately:',
      options: ['3 dB', '6 dB', '10 dB', '1.76 dB'],
      correctIdx: 1,
      explanation: 'The standard SQNR formula is SQNR ≈ 6.02 n + 1.76 dB. Adding 1 bit increases n by 1, yielding +6.02 dB improvement.',
    },
    {
      question: 'Why is Gray coding universally used in PSK and QAM digital symbol constellations?',
      options: [
        'It minimizes the required carrier power',
        'Adjacent constellation points differ by only 1 single bit, so the most likely symbol error produces only a 1-bit error',
        'It reduces the transmission bandwidth by half',
        'It prevents phase ambiguities at the receiver',
      ],
      correctIdx: 1,
      explanation: 'Because noise causes samples to cross into immediately adjacent decision regions first, Gray coding ensures adjacent points differ by only 1 bit, minimizing the overall Bit Error Rate (BER).',
    },
  ];

  const handleSelectQuizOption = (qIdx: number, optIdx: number) => {
    setUserQuizAnswers((prev) => ({
      ...prev,
      [qIdx]: optIdx,
    }));
  };

  const calculateScore = () => {
    let score = 0;
    quizQuestions.forEach((q, idx) => {
      if (userQuizAnswers[idx] === q.correctIdx) score++;
    });
    return score;
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7045B8]">
            <span>University Curriculum</span>
            <span aria-hidden="true">·</span>
            <span>Communication Theory</span>
          </div>
          <h2 className="text-xl font-bold text-[#24212C] mt-0.5">
            Communication Systems Knowledge Base & Exam Prep
          </h2>
          <p className="text-xs text-[#77717F]">
            Master modulation principles, mathematical derivations, real-world trade-offs, and common exam pitfalls.
          </p>
        </div>
      </div>

      {/* "What happens if?" Interactive Scenarios */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#F1EBFA] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#F1EBFA] rounded-lg text-[#7045B8]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#24212C]">
                Interactive "What Happens If?" Scenarios
              </h3>
              <p className="text-xs text-[#77717F]">
                Critical engineering failure modes, edge cases, and theoretical edge conditions
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {whatHappensScenarios.map((sc, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-[#FAF9FD] border border-[#E8E3EF] hover:border-[#7045B8]/30 transition-all space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <h4 className="text-xs font-bold text-[#24212C]">{sc.title}</h4>
                </div>
                <p className="text-xs font-semibold text-[#4B287F]">{sc.question}</p>
                <p className="text-xs text-[#77717F] leading-relaxed">{sc.mechanism}</p>
              </div>

              <div className="pt-2 border-t border-[#E8E3EF] space-y-1">
                <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                  <strong>Engineering Solution:</strong> {sc.mitigation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Self-Assessment Examination Quiz */}
      <div className="bg-white border border-[#E8E3EF] rounded-xl p-6 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1EBFA] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#F1EBFA] rounded-lg text-[#7045B8]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#24212C]">
                Self-Assessment Quiz (ECE 301 / Communication Systems)
              </h3>
              <p className="text-xs text-[#77717F]">
                Test your conceptual and numerical mastery with instant step-by-step solutions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {showQuizResults && (
              <span className="text-xs font-mono font-bold text-[#4B287F] bg-[#F1EBFA] px-3 py-1.5 rounded-lg border border-[#7045B8]/20">
                Score: {calculateScore()} / {quizQuestions.length} ({((calculateScore() / quizQuestions.length) * 100).toFixed(0)}%)
              </span>
            )}
            <button
              onClick={() => setShowQuizResults(!showQuizResults)}
              className="px-3.5 py-1.5 bg-[#7045B8] hover:bg-[#4B287F] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              {showQuizResults ? 'Hide Explanations' : 'Check Answers'}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {quizQuestions.map((q, qIdx) => {
            const selectedOpt = userQuizAnswers[qIdx];
            const isCorrect = selectedOpt === q.correctIdx;

            return (
              <div
                key={qIdx}
                className="p-4 rounded-xl border border-[#E8E3EF] bg-[#FDFDFE] space-y-3"
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono font-bold text-[#7045B8] bg-[#F1EBFA] px-2 py-0.5 rounded">
                    Q{qIdx + 1}
                  </span>
                  <h4 className="text-xs font-semibold text-[#24212C] leading-snug">{q.question}</h4>
                </div>

                {/* Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = selectedOpt === optIdx;
                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelectQuizOption(qIdx, optIdx)}
                        className={`p-2.5 text-left text-xs rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#F1EBFA] border-[#7045B8] text-[#4B287F] font-semibold'
                            : 'bg-white border-[#E8E3EF] text-[#77717F] hover:border-[#7045B8]/40'
                        }`}
                      >
                        <span className="font-mono mr-1.5 text-[#7045B8]">
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Feedback */}
                {showQuizResults && (
                  <div
                    className={`p-3 rounded-lg text-xs leading-relaxed ${
                      isCorrect
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      {isCorrect ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Correct!</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-amber-700" />
                          <span>
                            Incorrect. Correct answer is ({String.fromCharCode(65 + q.correctIdx)}).
                          </span>
                        </>
                      )}
                    </div>
                    <p>{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
