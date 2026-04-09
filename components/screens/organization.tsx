'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/app-context';
import { Plus, ChevronRight, Building2, Home } from 'lucide-react';

export function OrganizationScreen() {
  const { currentUser, setScreen, selectedOrgId, setSelectedOrgId } = useApp();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBuilding, setShowNewBuilding] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);


  const loadOrganizations = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const { data, error } = await supabase
        .from('organisations')
        .select('*')
        .eq('owner_id', currentUser.id);

      if (error) throw error;
      setOrganizations(data || []);

      if (data && data.length > 0 && !selectedOrgId) {
        setSelectedOrgId(data[0].id);
      }
    } catch (error) {
      console.error('[v0] Error loading organizations:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, selectedOrgId, setSelectedOrgId]);

  const loadBuildings = useCallback(async () => {
    if (!selectedOrgId) return;

    try {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .eq('organisation_id', selectedOrgId);

      if (error) throw error;
      setBuildings(data || []);
      setSelectedBuildingId(null);
      setRooms([]);
    } catch (error) {
      console.error('[v0] Error loading buildings:', error);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadOrganizations();
  }, [currentUser?.id, loadOrganizations]);

  useEffect(() => {
    if (selectedOrgId) {
      loadBuildings();
    }
  }, [selectedOrgId, loadBuildings]);

  async function loadRooms(buildingId: string) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('building_id', buildingId);

      if (error) throw error;
      setRooms(data || []);
      setSelectedBuildingId(buildingId);
    } catch (error) {
      console.error('[v0] Error loading rooms:', error);
    }
  }

  async function createBuilding() {
    if (!selectedOrgId || !newBuildingName.trim()) return;

    try {
      const { error } = await supabase.from('buildings').insert({
        organisation_id: selectedOrgId,
        name: newBuildingName,
      });

      if (error) throw error;

      setNewBuildingName('');
      setShowNewBuilding(false);
      loadBuildings();
    } catch (error) {
      console.error('[v0] Error creating building:', error);
    }
  }

  async function createRoom() {
    if (!selectedBuildingId || !newRoomName.trim()) return;

    try {
      const { error } = await supabase.from('rooms').insert({
        building_id: selectedBuildingId,
        name: newRoomName,
      });

      if (error) throw error;

      setNewRoomName('');
      setShowNewRoom(false);
      loadRooms(selectedBuildingId);
    } catch (error) {
      console.error('[v0] Error creating room:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-6 py-6">
        <h1 className="text-2xl font-bold mb-2">Organizations</h1>
        <p className="text-sm opacity-90">Manage buildings and rooms</p>
      </div>

      {/* Organization Selection */}
      {organizations.length > 0 && (
        <div className="px-6 py-4 border-b border-border">
          <label className="text-sm font-medium text-foreground block mb-2">
            Select Organization
          </label>
          <select
            value={selectedOrgId || ''}
            onChange={(e) => {
              setSelectedOrgId(e.target.value);
              setRooms([]);
            }}
            className="w-full px-4 py-2 rounded-lg bg-secondary border border-border text-foreground"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="p-6">
        {/* Buildings Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Building2 size={20} /> Buildings
            </h2>
            <button
              onClick={() => setShowNewBuilding(true)}
              className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              <Plus size={20} />
            </button>
          </div>

          {showNewBuilding && (
            <div className="bg-card border border-border rounded-lg p-4 mb-4">
              <input
                type="text"
                value={newBuildingName}
                onChange={(e) => setNewBuildingName(e.target.value)}
                placeholder="Building name (e.g., Block A)"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={createBuilding}
                  className="flex-1 bg-success text-success-foreground py-2 rounded-lg font-medium hover:bg-success/90"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowNewBuilding(false)}
                  className="flex-1 bg-secondary text-foreground py-2 rounded-lg font-medium hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {buildings.length === 0 ? (
              <p className="text-muted-foreground text-sm">No buildings yet</p>
            ) : (
              buildings.map((building) => (
                <button
                  key={building.id}
                  onClick={() => loadRooms(building.id)}
                  className={`w-full p-4 rounded-lg border transition flex items-center justify-between ${
                    selectedBuildingId === building.id
                      ? 'bg-accent border-accent-foreground'
                      : 'bg-card border-border hover:border-accent-foreground'
                  }`}
                >
                  <span className="font-medium text-foreground">{building.name}</span>
                  <ChevronRight size={20} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Rooms Section */}
        {selectedBuildingId && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Home size={20} /> Rooms
              </h2>
              <button
                onClick={() => setShowNewRoom(true)}
                className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <Plus size={20} />
              </button>
            </div>

            {showNewRoom && (
              <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Room number (e.g., 101)"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={createRoom}
                    className="flex-1 bg-success text-success-foreground py-2 rounded-lg font-medium hover:bg-success/90"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewRoom(false)}
                    className="flex-1 bg-secondary text-foreground py-2 rounded-lg font-medium hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {rooms.length === 0 ? (
                <p className="text-muted-foreground text-sm">No rooms yet</p>
              ) : (
                rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => setScreen('group-detail')}
                    className="w-full p-4 rounded-lg border border-border bg-card hover:border-primary transition flex items-center justify-between"
                  >
                    <span className="font-medium text-foreground">{room.name}</span>
                    <ChevronRight size={20} className="text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
