-- Migration: 0222_document_type_enum_extend.sql
-- Description: Add missing document_type enum values for document templates UI
-- Date: 2026-03-21
--
-- The document templates frontend uses categories 'nda' and 'custom' which
-- are not in the original document_type enum. This migration adds them.

ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'nda';
ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'custom';
