/**
 * Migration: 20240105000000_add_virustotal_to_files.js
 *
 * Adds VirusTotal scan result columns to the files table.
 */

'use strict';

const TABLE = 'files';

exports.up = async function (knex) {
  await knex.schema.table(TABLE, (table) => {
    table
      .integer('vt_malicious')
      .nullable()
      .comment('VirusTotal: count of engines that flagged as malicious');

    table
      .integer('vt_total')
      .nullable()
      .comment('VirusTotal: total engines queried');

    table
      .text('vt_detection_ratio')
      .nullable()
      .comment('VirusTotal: formatted detection ratio, e.g. "2/72"');

    table
      .jsonb('vt_detections')
      .nullable()
      .comment('VirusTotal: array of engine detection strings');
  });
};

exports.down = async function (knex) {
  await knex.schema.table(TABLE, (table) => {
    table.dropColumn('vt_malicious');
    table.dropColumn('vt_total');
    table.dropColumn('vt_detection_ratio');
    table.dropColumn('vt_detections');
  });
};
