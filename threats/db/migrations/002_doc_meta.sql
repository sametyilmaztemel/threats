-- =====================================================
-- Migration 002: analyst-grade metadata columns on documents
-- Phase 1, V2 plan — Task 1.3
-- =====================================================
-- Idempotent: ADD COLUMN IF NOT EXISTS + CHECK constraints.
-- (Re-applying is safe; CHECK constraints on existing rows would fail only
--  if a row violates the constraint, which defaults backfill to valid values.)

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS tlp TEXT DEFAULT 'GREEN'
    CHECK (tlp IN ('WHITE','GREEN','AMBER','RED')),
  ADD COLUMN IF NOT EXISTS confidence SMALLINT DEFAULT 50
    CHECK (confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS kill_chain_phase TEXT
    CHECK (kill_chain_phase IN ('recon','weaponize','deliver','exploit','install','c2','actions')),
  ADD COLUMN IF NOT EXISTS word_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
