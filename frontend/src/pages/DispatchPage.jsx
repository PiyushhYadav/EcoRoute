import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapCanvas from '../components/MapCanvas';
import InspectorPanel from '../components/InspectorPanel';
import DisruptionModal from '../components/DisruptionModal';
import NodeConfigModal from '../components/NodeConfigModal';
import { api } from '../api/client';
import { unlockAudio, stopAllSounds } from '../utils/soundEngine';

export default function DispatchPage() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [pickupWalkthroughs, setPickupWalkthroughs] = useState([]);
  const [distanceMatrix, setDistanceMatrix] = useState({});
  const [greedySummary, setGreedySummary] = useState(null);
  const [optimalSummary, setOptimalSummary] = useState(null);

  // Focus & Walkthrough Tab State: 'P1' | 'P2' | 'P3' | 'P4' | 'ALL'
  const [selectedPickupId, setSelectedPickupId] = useState('P1');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRunAll, setIsRunAll] = useState(false);
  const [currentRunAllIndex, setCurrentRunAllIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [dispatchOrder, setDispatchOrder] = useState('default');
  const [metric, setMetric] = useState('time'); // 'time' | 'distance'

  const runAllTimerRef = useRef(null);
  const isRunAllRef = useRef(false);
  isRunAllRef.current = isRunAll;
  const currentRunAllIndexRef = useRef(0);
  currentRunAllIndexRef.current = currentRunAllIndex;

  // Disruption modal state
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isDisruptionModalOpen, setIsDisruptionModalOpen] = useState(false);

  // Node config modal state
  const [selectedConfigNode, setSelectedConfigNode] = useState(null);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);

  // Toast feedback state
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  // Preview path override state (when hovering matrix cell)
  const [previewPathNodes, setPreviewPathNodes] = useState(null);

  // Previous allocations map for reroute comparison
  const previousAllocationsRef = useRef({});
  const lastMetricRef = useRef(metric);
  const [rerouteNotice, setRerouteNotice] = useState(null);

  // Loading indicator
  const [loading, setLoading] = useState(true);

  // Load optimization data from API
  const loadData = useCallback(
    async (order = dispatchOrder, activeMetric = metric) => {
      try {
        setLoading(true);
        const res = await api.getOptimization(order, activeMetric);

        const newNodes = res.graph?.nodes || [];
        const newEdges = res.graph?.edges || [];
        const newWalkthroughs = res.pickup_walkthroughs || [];
        const newGreedySummary = res.greedy_summary || null;
        const newOptimalSummary = res.optimal_summary || null;

        // Check for reroutes on active pickup only when metric remains the same
        const metricChanged = lastMetricRef.current !== activeMetric;
        lastMetricRef.current = activeMetric;

        const oldAllocs = previousAllocationsRef.current || {};
        const newAllocs = {};
        if (newGreedySummary?.allocations) {
          newGreedySummary.allocations.forEach((a) => {
            newAllocs[a.pickup_id] = a;
          });
        }

        // Compare old vs new path for selected pickup if it already existed and metric was not changed
        if (
          !metricChanged &&
          selectedPickupId &&
          selectedPickupId !== 'ALL' &&
          oldAllocs[selectedPickupId] &&
          newAllocs[selectedPickupId]
        ) {
          const oldA = oldAllocs[selectedPickupId];
          const newA = newAllocs[selectedPickupId];
          const oldPathStr = (oldA.path_nodes || []).join(' → ');
          const newPathStr = (newA.path_nodes || []).join(' → ');

          if (oldPathStr && newPathStr && oldPathStr !== newPathStr) {
            const costUnit = activeMetric === 'time' ? 'min' : 'km';
            const oldCost = activeMetric === 'time'
              ? Number(oldA.total_time_min ?? oldA.total_cost ?? 0)
              : Number(oldA.total_distance_km ?? oldA.total_cost ?? 0);
            const newCost = activeMetric === 'time'
              ? Number(newA.total_time_min ?? newA.total_cost ?? 0)
              : Number(newA.total_distance_km ?? newA.total_cost ?? 0);

            const costDiffNum = newCost - oldCost;
            const diffSign = costDiffNum > 0 ? `+${costDiffNum.toFixed(1)}` : costDiffNum.toFixed(1);
            const oldCostStr = Number.isFinite(oldCost) ? `${oldCost.toFixed(1)} ${costUnit}` : '∞';
            const newCostStr = Number.isFinite(newCost) ? `${newCost.toFixed(1)} ${costUnit}` : '∞';

            setRerouteNotice({
              pickupId: selectedPickupId,
              message: `Graph change detected! ${newA.pickup_name} rerouted: ${oldA.assigned_centre_name || 'Centre'} (${oldCostStr}) → ${newA.assigned_centre_name || 'Centre'} (${newCostStr}) [${diffSign} ${costUnit}].`,
              oldPath: oldA.path_nodes || [],
              newPath: newA.path_nodes || [],
            });
          }
        }

        previousAllocationsRef.current = newAllocs;

        setNodes(newNodes);
        setEdges(newEdges);
        setPickupWalkthroughs(newWalkthroughs);
        setDistanceMatrix(res.distance_matrix || {});
        setGreedySummary(newGreedySummary);
        setOptimalSummary(newOptimalSummary);
      } catch (err) {
        console.error('Error loading optimization data:', err);
      } finally {
        setLoading(false);
      }
    },
    [dispatchOrder, metric, selectedPickupId]
  );

  useEffect(() => {
    loadData(dispatchOrder, metric);
  }, [loadData, dispatchOrder, metric]);

  // Current active walkthrough & step
  const activeWalkthrough =
    pickupWalkthroughs.find((w) => w.pickup_id === selectedPickupId) ||
    pickupWalkthroughs[0] ||
    null;

  const currentSteps = activeWalkthrough?.steps || [];
  const activeStep = currentSteps[currentStepIndex] || currentSteps[0] || null;

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAllSounds();
    };
  }, []);

  // Stop Run All & Playback cleanly
  const handleStopAll = useCallback(() => {
    stopAllSounds();
    isRunAllRef.current = false;
    setIsRunAll(false);
    setIsPlaying(false);
    if (runAllTimerRef.current) {
      clearTimeout(runAllTimerRef.current);
      runAllTimerRef.current = null;
    }
  }, []);

  // Advance Run All sequentially across pickups: wipes clean between pickups
  const advanceRunAll = useCallback(() => {
    if (!isRunAllRef.current) return;

    if (runAllTimerRef.current) {
      clearTimeout(runAllTimerRef.current);
      runAllTimerRef.current = null;
    }

    const nextIndex = currentRunAllIndexRef.current + 1;
    if (nextIndex < pickupWalkthroughs.length) {
      // Wipe Clean Between Pickups:
      // Clear previous pickup route highlights, visited SPT edges, and node cost chips
      // back to thin neutral slate so the map starts completely clean for the next pickup.
      // Changing selectedPickupId to next pickup and setting step to 0 loads dijkstra_init of next pickup.
      currentRunAllIndexRef.current = nextIndex;
      setCurrentRunAllIndex(nextIndex);
      setSelectedPickupId(pickupWalkthroughs[nextIndex].pickup_id);
      setCurrentStepIndex(0);
      setPreviewPathNodes(null);
    } else {
      // Once the final pickup finishes its confirmation drive, automatically
      // switches to the All Summary tab to display all completed routes and aggregate metrics together.
      isRunAllRef.current = false;
      setIsRunAll(false);
      currentRunAllIndexRef.current = 0;
      setCurrentRunAllIndex(0);
      setSelectedPickupId('ALL');
      setCurrentStepIndex(0);
      setPreviewPathNodes(null);
    }
  }, [pickupWalkthroughs]);

  // Vehicle arrival callback for Run All mode
  const handleVehicleFinish = useCallback((finishedPickupId) => {
    if (!isRunAllRef.current) return;

    // Verify finished pickup matches active pickup in currentRunAllIndex
    const currentWalkthrough = pickupWalkthroughs[currentRunAllIndexRef.current];
    if (finishedPickupId && currentWalkthrough && finishedPickupId !== currentWalkthrough.pickup_id) {
      return;
    }

    // Route confirmed and vehicle reached destination!
    // Hold ~800ms visual pause so viewer sees completed assignment & updated capacity bar, then advance to next pickup
    if (runAllTimerRef.current) {
      clearTimeout(runAllTimerRef.current);
      runAllTimerRef.current = null;
    }
    runAllTimerRef.current = setTimeout(() => {
      advanceRunAll();
    }, 800);
  }, [advanceRunAll, pickupWalkthroughs]);

  // Start Run All Sequential Simulation
  const handleRunAll = useCallback(() => {
    unlockAudio();
    handleStopAll();
    if (!pickupWalkthroughs.length) return;

    isRunAllRef.current = true;
    currentRunAllIndexRef.current = 0;
    setIsRunAll(true);
    setCurrentRunAllIndex(0);
    setSelectedPickupId(pickupWalkthroughs[0].pickup_id);
    setCurrentStepIndex(0);
    setPreviewPathNodes(null);
  }, [handleStopAll, pickupWalkthroughs]);

  // Single-Pickup Automated Playback Timer
  useEffect(() => {
    if (isRunAll || !isPlaying || selectedPickupId === 'ALL') return;

    const intervalTime = Math.max(Math.round(680 / playbackSpeed), Math.floor(1000 / playbackSpeed));
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= currentSteps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        if (next >= currentSteps.length - 1) {
          setIsPlaying(false);
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, isRunAll, playbackSpeed, currentSteps.length, selectedPickupId]);

  // Run All Sequential Playback Timer
  useEffect(() => {
    if (!isRunAll) return;

    const currentWalkthrough = pickupWalkthroughs[currentRunAllIndex];
    if (!currentWalkthrough) {
      handleStopAll();
      return;
    }

    const steps = currentWalkthrough.steps || [];
    if (steps.length === 0) {
      advanceRunAll();
      return;
    }

    if (currentStepIndex >= steps.length - 1) {
      // Reached the terminal/route_confirm step of this pickup
      const finalStep = steps[currentStepIndex] || {};
      const pathNodes = finalStep.path_nodes || [];

      // If no multi-node path (e.g. unassignable or empty route), hold 800ms and advance
      if (pathNodes.length < 2) {
        if (runAllTimerRef.current) clearTimeout(runAllTimerRef.current);
        runAllTimerRef.current = setTimeout(() => {
          advanceRunAll();
        }, 800);
      }
      // If pathNodes.length >= 2, the step timer is intentionally PAUSED!
      // MapCanvas animates Mr. Bean's Mini Cooper along the route, and when the car reaches
      // the destination centre, MapCanvas invokes handleVehicleFinish(pickupId), which
      // waits 800ms and advances to the next pickup!
      return;
    }

    // Play through intermediate steps of this pickup (>= 680ms / playbackSpeed)
    const stepInterval = Math.max(Math.round(680 / playbackSpeed), Math.floor(1000 / playbackSpeed));
    const timer = setTimeout(() => {
      setCurrentStepIndex((prev) => prev + 1);
    }, stepInterval);

    return () => clearTimeout(timer);
  }, [isRunAll, currentRunAllIndex, currentStepIndex, pickupWalkthroughs, playbackSpeed, advanceRunAll, handleStopAll]);

  // Tab Selection Handler (P1, P2, P3, P4, ALL)
  const handleSelectPickupTab = (tabId) => {
    stopAllSounds();
    handleStopAll();
    setSelectedPickupId(tabId);
    setCurrentStepIndex(0);
    setPreviewPathNodes(null);
  };

  // Playback Control Handlers
  const handlePlayPause = () => {
    unlockAudio();
    if (isRunAll) {
      handleStopAll();
      return;
    }
    if (currentStepIndex >= currentSteps.length - 1) {
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      if (isPlaying) {
        stopAllSounds();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handlePrevStep = () => {
    unlockAudio();
    handleStopAll();
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextStep = () => {
    unlockAudio();
    handleStopAll();
    setCurrentStepIndex((prev) => Math.min(currentSteps.length - 1, prev + 1));
  };

  const handleResetStep = () => {
    stopAllSounds();
    handleStopAll();
    setCurrentStepIndex(0);
  };

  const handleSetDispatchOrder = (order) => {
    handleStopAll();
    previousAllocationsRef.current = {};
    setRerouteNotice(null);
    setDispatchOrder(order);
    handleResetStep();
  };

  const handleSetMetric = (newMetric) => {
    handleStopAll();
    previousAllocationsRef.current = {};
    lastMetricRef.current = newMetric;
    setRerouteNotice(null);
    setMetric(newMetric);
    handleResetStep();
  };

  // Edge Disruption Handlers
  const handleEdgeClick = (edge) => {
    setSelectedEdge(edge);
    setIsDisruptionModalOpen(true);
  };

  const handleSaveEdge = async (edgeId, updates) => {
    await api.updateEdge(edgeId, updates);
    await loadData(dispatchOrder, metric);
  };

  const handleDeleteEdge = async (edgeId) => {
    await api.deleteEdge(edgeId);
    await loadData(dispatchOrder, metric);
  };

  // Node Inspection & Configuration Handlers
  const handleInspectNode = useCallback(
    (node) => {
      handleStopAll();
      stopAllSounds();
      const freshNode = nodes.find((n) => n.id === node.id) || node;
      setSelectedConfigNode(freshNode);
      setIsNodeModalOpen(true);
    },
    [handleStopAll, nodes]
  );

  const handleSaveNode = async (nodeId, payload) => {
    await api.updateNode(nodeId, payload);
    await loadData(dispatchOrder, metric);
    const nodeName = payload.name || selectedConfigNode?.name || nodeId;
    showToast(`Updated ${nodeName} — routes recalculated`);
  };

  const handleDeleteNode = async (nodeId) => {
    if (selectedPickupId === nodeId) {
      const remainingPickups = nodes.filter(
        (n) => (n.kind === 'pickup' || (n.id && n.id.startsWith('P'))) && n.id !== nodeId
      );
      if (remainingPickups.length > 0) {
        setSelectedPickupId(remainingPickups[0].id);
      } else {
        setSelectedPickupId('ALL');
      }
      setCurrentStepIndex(0);
      setPreviewPathNodes(null);
    }
    await api.deleteNode(nodeId);
    await loadData(dispatchOrder, metric);
    const nodeName = selectedConfigNode?.name || nodeId;
    showToast(`Deleted ${nodeName} — network updated`);
  };

  // Quick Presets
  const handleApplyDisruptionPreset = async (preset) => {
    handleStopAll();
    if (preset === 'block_hub') {
      // Find edge between J1 and J2 (E10)
      const edge = edges.find(
        (e) =>
          (e.source_id === 'J1' && e.target_id === 'J2') ||
          (e.source_id === 'J2' && e.target_id === 'J1')
      );
      if (edge) {
        await api.updateEdge(edge.id, { is_blocked: 1 });
      }
    } else if (preset === 'peak_traffic') {
      // Set traffic multiplier 2.5 on arterial edges
      for (const edge of edges) {
        if (edge.source_id.startsWith('J') || edge.target_id.startsWith('J')) {
          await api.updateEdge(edge.id, { traffic_multiplier: 2.5, is_blocked: 0 });
        }
      }
    } else if (preset === 'clear_all') {
      previousAllocationsRef.current = {};
      setRerouteNotice(null);
      for (const edge of edges) {
        await api.updateEdge(edge.id, { traffic_multiplier: 1.0, is_blocked: 0 });
      }
    }
    await loadData(dispatchOrder, metric);
    handleResetStep();
  };

  // Create Pickup on Canvas
  const handleCreatePickup = async (pickupPayload) => {
    handleStopAll();
    const created = await api.createPickup(pickupPayload);
    await loadData(dispatchOrder, metric);
    if (created?.id) {
      setSelectedPickupId(created.id);
      setCurrentStepIndex(0);
    }
    return created;
  };

  // Create Centre on Canvas
  const handleCreateCentre = async (centrePayload) => {
    handleStopAll();
    const created = await api.createCentre(centrePayload);
    await loadData(dispatchOrder, metric);
    return created;
  };

  // Connect Nodes with Road Edge
  const handleConnectNodes = async (sourceId, targetId) => {
    handleStopAll();
    const created = await api.createEdge({
      source_id: sourceId,
      target_id: targetId,
      traffic_multiplier: 1.0,
      is_blocked: 0,
    });
    await loadData(dispatchOrder, metric);
    return created;
  };

  // Preview shortest path from Matrix hover
  const handlePreviewPath = (pickupId, centreId) => {
    const alloc = greedySummary?.allocations?.find((a) => a.pickup_id === pickupId);
    if (alloc && alloc.assigned_centre_id === centreId) {
      setPreviewPathNodes(alloc.path_nodes);
    }
  };

  const nodesMap = React.useMemo(() => {
    const map = {};
    nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [nodes]);

  const pickupsCount = React.useMemo(
    () => nodes.filter((n) => n.kind === 'pickup' || (n.id && n.id.startsWith('P'))).length,
    [nodes]
  );
  const centresCount = React.useMemo(
    () => nodes.filter((n) => n.kind === 'centre' || (n.id && n.id.startsWith('R'))).length,
    [nodes]
  );

  // Resolve step to pass to canvas
  const canvasStep = React.useMemo(() => {
    if (previewPathNodes) {
      return { ...(activeStep || {}), path_nodes: previewPathNodes };
    }
    if (selectedPickupId === 'ALL') {
      // In ALL summary view, show all confirmed route edges simultaneously
      const allPathEdges = [];
      const allPathNodes = [];
      greedySummary?.allocations?.forEach((a) => {
        if (a.status === 'assigned') {
          allPathEdges.push(...(a.path_edges || []));
          allPathNodes.push(...(a.path_nodes || []));
        }
      });
      return {
        event_type: 'route_confirm',
        path_nodes: allPathNodes,
        path_edges: allPathEdges,
        visited_nodes: nodes.map((n) => n.id),
      };
    }
    return activeStep;
  }, [previewPathNodes, selectedPickupId, activeStep, greedySummary, nodes]);

  return (
    <div className="h-[calc(100vh-4.25rem)] w-full flex flex-col p-3 sm:p-4 gap-3 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
        {/* Left Inspector & Walkthrough Panel (~36% width, 4 columns on lg) */}
        <div className="lg:col-span-4 h-full min-h-[380px] lg:min-h-0 flex flex-col">
          <InspectorPanel
            pickupWalkthroughs={pickupWalkthroughs}
            selectedPickupId={selectedPickupId}
            currentStepIndex={currentStepIndex}
            isPlaying={isPlaying}
            isRunAll={isRunAll}
            currentRunAllIndex={currentRunAllIndex}
            playbackSpeed={playbackSpeed}
            dispatchOrder={dispatchOrder}
            metric={metric}
            distanceMatrix={distanceMatrix}
            nodes={nodes}
            edges={edges}
            greedySummary={greedySummary}
            optimalSummary={optimalSummary}
            rerouteNotice={rerouteNotice}
            onSelectPickupTab={handleSelectPickupTab}
            onPlayPause={handlePlayPause}
            onRunAll={handleRunAll}
            onStopAll={handleStopAll}
            onPrevStep={handlePrevStep}
            onNextStep={handleNextStep}
            onResetStep={handleResetStep}
            onSetStep={setCurrentStepIndex}
            onSetSpeed={setPlaybackSpeed}
            onSetDispatchOrder={handleSetDispatchOrder}
            onSetMetric={handleSetMetric}
            onApplyDisruptionPreset={handleApplyDisruptionPreset}
            onPreviewPath={handlePreviewPath}
          />
        </div>

        {/* Right Delhi NCR Map Canvas (~64% width, 8 columns on lg) */}
        <div className="lg:col-span-8 h-full min-h-[450px] lg:min-h-0 relative">
          <MapCanvas
            nodes={nodes}
            edges={edges}
            activeStep={canvasStep}
            walkthroughStep={canvasStep}
            activePickupId={selectedPickupId !== 'ALL' ? selectedPickupId : null}
            metric={metric}
            centreCapacities={activeStep?.centre_capacities || {}}
            playbackSpeed={playbackSpeed}
            previousPath={rerouteNotice?.oldPath || null}
            allocations={greedySummary?.allocations || []}
            isPlaying={isPlaying}
            isRunAll={isRunAll}
            onSelectPickup={handleSelectPickupTab}
            onMetricChange={handleSetMetric}
            onSelectEdge={handleEdgeClick}
            onInspectNode={handleInspectNode}
            onCreatePickup={handleCreatePickup}
            onCreateCentre={handleCreateCentre}
            onConnectNodes={handleConnectNodes}
            onVehicleFinish={handleVehicleFinish}
          />
        </div>
      </div>

      {/* Edge Disruption Modal */}
      <DisruptionModal
        edge={selectedEdge}
        nodesMap={nodesMap}
        isOpen={isDisruptionModalOpen}
        onClose={() => setIsDisruptionModalOpen(false)}
        onSave={handleSaveEdge}
        onDelete={handleDeleteEdge}
      />

      {/* Node (Pickup & Recycling Site) Configuration Modal */}
      <NodeConfigModal
        node={selectedConfigNode}
        isOpen={isNodeModalOpen}
        onClose={() => setIsNodeModalOpen(false)}
        onSave={handleSaveNode}
        onDelete={handleDeleteNode}
        allocations={greedySummary?.allocations || []}
        centreCapacities={activeStep?.centre_capacities || {}}
        pickupsCount={pickupsCount}
        centresCount={centresCount}
      />

      {/* Live Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md bg-slate-900/90 text-slate-100 border border-slate-700/50 flex items-center gap-2 pointer-events-none animate-fade-in">
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
