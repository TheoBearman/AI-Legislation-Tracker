"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Stubbed hook: always returns not signed in (auth removed)
export function useFollowRepresentative(repId: string, initialIsFollowed?: boolean) {
  const { toast } = useToast();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isSignedIn = false; // Auth removed

  const toggleFollow = useCallback(async () => {
    // Auth removed - show sign-in message if someone tries to follow
    toast({
      title: "Feature unavailable",
      description: "Following representatives requires authentication, which has been removed from this app.",
      variant: "destructive",
    });
  }, [toast]);

  return {
    isFollowing,
    isLoading,
    toggleFollow,
    isSignedIn,
  };
}

export function useFollowedRepresentatives() {
  const [followedReps, setFollowedReps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFollowedReps = useCallback(async () => {
    // Auth removed - always return empty
    setFollowedReps([]);
  }, []);

  useEffect(() => {
    fetchFollowedReps();
  }, [fetchFollowedReps]);

  return {
    followedReps,
    isLoading,
    refetch: fetchFollowedReps,
  };
}
