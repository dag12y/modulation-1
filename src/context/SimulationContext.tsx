import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface SimulationContextType {
  isSimulating: boolean;
  toggleSimulation: () => void;
  setIsSimulating: (sim: boolean) => void;
  simulationSpeed: number;
  setSimulationSpeed: (speed: number) => void;
  triggerLocked: boolean;
  toggleTriggerLock: () => void;
  animTime: number; // continuously running time in seconds for animated signals
  frame: number;
}

const SimulationContext = createContext<SimulationContextType>({
  isSimulating: true,
  toggleSimulation: () => {},
  setIsSimulating: () => {},
  simulationSpeed: 1,
  setSimulationSpeed: () => {},
  triggerLocked: false,
  toggleTriggerLock: () => {},
  animTime: 0,
  frame: 0,
});

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [triggerLocked, setTriggerLocked] = useState<boolean>(false);
  const [animTime, setAnimTime] = useState<number>(0);
  const [frame, setFrame] = useState<number>(0);

  const lastTimestampRef = useRef<number | null>(null);
  const animTimeRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const isSimulatingRef = useRef<boolean>(true);
  const triggerLockedRef = useRef<boolean>(false);
  const speedRef = useRef<number>(1);

  useEffect(() => {
    isSimulatingRef.current = isSimulating;
  }, [isSimulating]);

  useEffect(() => {
    triggerLockedRef.current = triggerLocked;
  }, [triggerLocked]);

  useEffect(() => {
    speedRef.current = simulationSpeed;
  }, [simulationSpeed]);

  useEffect(() => {
    let animId: number;

    const animate = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }
      const delta = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      // Ultra-smooth 60fps RF timescale (0.075 ms/s at 1x, 0.015 ms/s at 0.2x)
      // prevents carrier phase strobing/vibration while staying responsive to speed controls
      const RF_TIME_SCALE = 0.000075;

      if (
        isSimulatingRef.current &&
        !triggerLockedRef.current &&
        delta > 0 &&
        delta < 0.2
      ) {
        animTimeRef.current += delta * speedRef.current * RF_TIME_SCALE;
        frameRef.current += 1;
        setAnimTime(animTimeRef.current);
        setFrame(frameRef.current);
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  const toggleSimulation = () => {
    setIsSimulating((prev) => !prev);
  };

  const toggleTriggerLock = () => {
    setTriggerLocked((prev) => !prev);
  };

  return (
    <SimulationContext.Provider
      value={{
        isSimulating,
        toggleSimulation,
        setIsSimulating,
        simulationSpeed,
        setSimulationSpeed,
        triggerLocked,
        toggleTriggerLock,
        animTime,
        frame,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => useContext(SimulationContext);
