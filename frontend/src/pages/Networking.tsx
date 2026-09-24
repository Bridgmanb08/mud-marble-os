import { useEffect, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { NetworkGraph } from '../components/networking/NetworkGraph';
import { AddPersonModal } from '../components/networking/AddPersonModal';
import { PersonDetailModal } from '../components/networking/PersonDetailModal';
import type { NetworkGraph as NetworkGraphData, NetworkPerson } from '../types';

// Brent's own relationship map -- drag bubbles around, scroll to zoom, drag
// the background to pan, click a bubble for notes/contact info, click the
// "+" on a bubble to add someone that person connects Brent to. The shape
// of the web (who introduced whom, including the same person being
// reachable two different ways) lives entirely in network_connections on
// the backend, not in this component.
export default function Networking() {
  const [graph, setGraph] = useState<NetworkGraphData | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<NetworkPerson | null>(null);
  const [addFromPerson, setAddFromPerson] = useState<NetworkPerson | null>(null);
  const [showAddStandalone, setShowAddStandalone] = useState(false);
  const toast = useToast();

  function load() {
    api
      .get<NetworkGraphData>('/network/graph')
      .then(setGraph)
      .catch(() => toast('Failed to load your network', true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnectExisting(fromPersonId: string, toPersonId: string) {
    try {
      await api.post('/network/connections', { from_person_id: fromPersonId, to_person_id: toPersonId });
      toast('Connected');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to connect', true);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Networking</h1>
          <p>Drag to rearrange, scroll to zoom, click a bubble for details, click + to grow the web</p>
        </div>
        <button className="btn btn-sm" onClick={() => setShowAddStandalone(true)}>
          <IconPlus size={14} /> New node
        </button>
      </div>

      {graph === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : (
        <NetworkGraph
          people={graph.people}
          connections={graph.connections}
          onNodeClick={setSelectedPerson}
          onAddClick={setAddFromPerson}
        />
      )}

      {addFromPerson && (
        <AddPersonModal
          fromPerson={addFromPerson}
          onClose={() => setAddFromPerson(null)}
          onCreated={() => {
            setAddFromPerson(null);
            load();
          }}
        />
      )}

      {showAddStandalone && (
        <AddPersonModal
          onClose={() => setShowAddStandalone(false)}
          onCreated={() => {
            setShowAddStandalone(false);
            load();
          }}
        />
      )}

      {selectedPerson && graph && (
        <PersonDetailModal
          person={selectedPerson}
          otherPeople={graph.people}
          onClose={() => setSelectedPerson(null)}
          onSaved={load}
          onDeleted={() => {
            setSelectedPerson(null);
            load();
          }}
          onConnectExisting={(toPersonId) => handleConnectExisting(selectedPerson.id, toPersonId)}
        />
      )}
    </>
  );
}
