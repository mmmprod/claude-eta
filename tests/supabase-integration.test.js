/**
 * Integration test — validates AnonymizedRecord format against the real Supabase schema.
 * Inserts a test record and verifies 201.
 * Test records use contributor_hash '0000...' and plugin_version '0.0.0-ci-test'
 * so the Edge Function can filter them from baselines aggregation.
 * Includes the current export/contribute shape so schema drift is caught.
 *
 * Skipped when SKIP_INTEGRATION=1 (default in unit test runs).
 * Runs in CI via a dedicated job.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insertVelocityRecords } from '../dist/supabase.js';

const SKIP = process.env.SKIP_INTEGRATION === '1';

describe('Supabase integration', { skip: SKIP }, () => {
  it('inserts a valid AnonymizedRecord without schema error', async () => {
    const testRecord = {
      task_type: 'other',
      duration_seconds: 1,
      tool_calls: 0,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      errors: 0,
      model: 'claude-sonnet-4',
      project_hash: 'ci-test-' + Date.now().toString(36),
      project_file_count: 10,
      project_loc_bucket: 'tiny',
      plugin_version: '0.0.0-ci-test',
      contributor_hash: '0000000000000000000000000000000000000000000000000000000000000000',
      source_turn_count: 1,
      record_unit: 'work_item',
    };

    const { error } = await insertVelocityRecords([testRecord]);
    assert.equal(error, null, `INSERT should succeed but got: ${error}`);
  });

  it('rejects a record with missing required fields', async () => {
    const badRecord = {
      task_type: 'other',
      // duration_seconds missing — NOT NULL in schema
    };

    const { error } = await insertVelocityRecords([badRecord]);
    assert.ok(error, 'INSERT with missing fields should fail');
  });

  it('rejects a record with invalid model format', async () => {
    const badRecord = {
      task_type: 'other',
      duration_seconds: 1,
      tool_calls: 0,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      errors: 0,
      model: 'gpt-4-invalid',
      project_hash: 'ci-test-schema',
      project_file_count: null,
      project_loc_bucket: null,
      plugin_version: '0.0.0-ci-test',
      contributor_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    };

    const { error } = await insertVelocityRecords([badRecord]);
    assert.ok(error, 'INSERT with invalid model should fail (CHECK constraint)');
  });
});
