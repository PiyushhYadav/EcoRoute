import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapCanvas from '../components/MapCanvas';
import InspectorPanel from '../components/InspectorPanel';
import DisruptionModal from '../components/DisruptionModal';
import { api } from '../api/client';

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
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [dispatchOrder, setDispatchOrder] = useState('default');
  const [metric, setMetric] = useState('time'); // 'time' | 'distance'

  // Disruption modal state
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isDisruptionModalOpen, setIsDisruptionModalOpen] = useState(false);

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

  // Automated Playback Timer
  useEffect(() => {
    if (!isPlaying || selectedPickupId === 'ALL') return;

    const intervalTime = Math.max(700, Math.floor(2000 / playbackSpeed));
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= currentSteps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, currentSteps.length, selectedPickupId]);

  // Tab Selection Handler (P1, P2, P3, P4, ALL)
  const handleSelectPickupTab = (tabId) => {
    setIsPlaying(false);
    setSelectedPickupId(tabId);
    setCurrentStepIndex(0);
    setPreviewPathNodes(null);
  };

  // Playback Control Handlers
  const handlePlayPause = () => {
    if (currentStepIndex >= currentSteps.length - 1) {
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handlePrevStep = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextStep = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.min(currentSteps.length - 1, prev + 1));
  };

  const handleResetStep = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const handleSetDispatchOrder = (order) => {
    previousAllocationsRef.current = {};
    setRerouteNotice(null);
    setDispatchOrder(order);
    handleResetStep();
  };

  const handleSetMetric = (newMetric) => {
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

  // Quick Presets
  const handleApplyDisruptionPreset = async (preset) => {
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
    const created = await api.createCentre(centrePayload);
    await loadData(dispatchOrder, metric);
    return created;
  };

  // Connect Nodes with Road Edge
  const handleConnectNodes = async (sourceId, targetId) => {
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

  // Resolve step to pass to canvas
  const canvasStep = React.useMemo(() => {
    if (previewPathNodes) {
      return { ...(activeStep || {}), path_nodes: previewPathNodes };
    }
    if (selectedPickupId === 'ALL') {
      // In ALL summary view, show all confirmed route edges
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
            onSelectPickup={handleSelectPickupTab}
            onMetricChange={handleSetMetric}
            onSelectEdge={handleEdgeClick}
            onCreatePickup={handleCreatePickup}
            onCreateCentre={handleCreateCentre}
            onConnectNodes={handleConnectNodes}
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
    </div>
  );
}
