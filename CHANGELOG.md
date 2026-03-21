# Changelog

## [0.15.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.14.1...claude-eta-v0.15.0) (2026-03-21)


### Features

* **classify,auto-eta:** similarity scoring + model-aware confidence ([#74](https://github.com/mmmprod/claude-eta/issues/74)) ([e898fa7](https://github.com/mmmprod/claude-eta/commit/e898fa7788c42767ee69385bae94870e990ac177))
* **eta:** live ETA recalculation on phase transitions ([#77](https://github.com/mmmprod/claude-eta/issues/77)) ([e2d93a0](https://github.com/mmmprod/claude-eta/commit/e2d93a02ba844eeebbc0a5a0650970479dec36ec))


### Bug Fixes

* **anonymize:** preserve model version in normalizeModel, unify normalizers ([#75](https://github.com/mmmprod/claude-eta/issues/75)) ([0dca350](https://github.com/mmmprod/claude-eta/commit/0dca350df47a3f0709ba135b88eb0c4455e32bf0))
* **export:** add source_turn_count to AnonymizedRecord for distribution parity ([#73](https://github.com/mmmprod/claude-eta/issues/73)) ([1492eee](https://github.com/mmmprod/claude-eta/commit/1492eeeb5a6f8450b82be5018724dab57cc03e40))

## [0.14.1](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.14.0...claude-eta-v0.14.1) (2026-03-21)


### Bug Fixes

* **predictor:** mature predictor — unified work_item, correct model normalization, real p80, live runtime, hardened transitions ([#71](https://github.com/mmmprod/claude-eta/issues/71)) ([f5e9c12](https://github.com/mmmprod/claude-eta/commit/f5e9c12b90d78d24456e84fdd2f2ae40d015b349))

## [0.14.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.13.0...claude-eta-v0.14.0) (2026-03-21)


### Features

* **eta:** harden tracker calibration and admin tooling ([#64](https://github.com/mmmprod/claude-eta/issues/64)) ([58bde0d](https://github.com/mmmprod/claude-eta/commit/58bde0d1b145071dc3c95721cc195eb235c26b5c))

## [0.13.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.12.0...claude-eta-v0.13.0) (2026-03-21)


### Features

* **loop-detector:** repair loop detection + community consent improvements ([#62](https://github.com/mmmprod/claude-eta/issues/62)) ([4a507e6](https://github.com/mmmprod/claude-eta/commit/4a507e6d7bcf623675b4a880b9644e8a1db062b5))

## [0.12.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.11.0...claude-eta-v0.12.0) (2026-03-21)


### Features

* **estimator,dedup:** live phase-aware predictor + server-side dedup + P0/P1 fixes ([#60](https://github.com/mmmprod/claude-eta/issues/60)) ([9d01f9a](https://github.com/mmmprod/claude-eta/commit/9d01f9a0455d7e166bfe24584c159d88e7e157d1))

## [0.11.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.10.0...claude-eta-v0.11.0) (2026-03-21)


### Features

* /eta admin-export — full admin dashboard JSON + standalone HTML viewer ([#43](https://github.com/mmmprod/claude-eta/issues/43)) ([004057f](https://github.com/mmmprod/claude-eta/commit/004057fc8904aa3c8640c885792ebc56cede2ab7))
* /eta auto — opt-in time estimates at response start ([#37](https://github.com/mmmprod/claude-eta/issues/37)) ([caece8d](https://github.com/mmmprod/claude-eta/commit/caece8d2e10a33782b5b2d6b3854c32e4506a04d))
* /eta insights — 9 deep analyses on dormant task data ([#39](https://github.com/mmmprod/claude-eta/issues/39)) ([5b0a619](https://github.com/mmmprod/claude-eta/commit/5b0a61931e056d61e9bf769778920cf264237c87))
* /eta recap daily journal + BS detector estimates-only filter ([#35](https://github.com/mmmprod/claude-eta/issues/35)) ([9025447](https://github.com/mmmprod/claude-eta/commit/9025447f2fa73ed6ddb6994627752d5b93b2dc09))
* add community baselines and contribution flow ([#19](https://github.com/mmmprod/claude-eta/issues/19)) ([601809b](https://github.com/mmmprod/claude-eta/commit/601809b6572a04dc99a1db49e75767210b3c66f7))
* **classify:** multilingual prompt classification (FR) + standalone admin dashboard ([#57](https://github.com/mmmprod/claude-eta/issues/57)) ([543e955](https://github.com/mmmprod/claude-eta/commit/543e9552e72e6f6f4d0f10792e2d667dee767698))
* **hooks:** implement SubagentStart/Stop for subagent turn tracking ([#47](https://github.com/mmmprod/claude-eta/issues/47)) ([46cd7c6](https://github.com/mmmprod/claude-eta/commit/46cd7c60798266336dd20e763d5b96bcc397a511))
* implement MVP tracking — prompt classification, tool counting, /eta CLI ([1a43d27](https://github.com/mmmprod/claude-eta/commit/1a43d27a8d49f3ba66639238f69b872f5f6d6071))
* improve calibration UX and feedback flow ([#17](https://github.com/mmmprod/claude-eta/issues/17)) ([f22238c](https://github.com/mmmprod/claude-eta/commit/f22238cbd05f7b69147be2425799141213860038))
* passive velocity context at session start ([597b47f](https://github.com/mmmprod/claude-eta/commit/597b47fd603a9ff81004f8fa9c33c16b09257d60))
* pre-emptive context injection — calibrate Claude with project velocity stats ([7a707cf](https://github.com/mmmprod/claude-eta/commit/7a707cfd44de69ebc64669f997487e2b350731d9))
* v2 event-log architecture — fixes 7 structural defects ([#41](https://github.com/mmmprod/claude-eta/issues/41)) ([da41400](https://github.com/mmmprod/claude-eta/commit/da4140010299981d3f111648c8f075da3911822c))


### Bug Fixes

* add fetch timeout and cache-first logic to community features ([#23](https://github.com/mmmprod/claude-eta/issues/23)) ([7e1f178](https://github.com/mmmprod/claude-eta/commit/7e1f17827022c9f2906ef7045e7bf269a497c790))
* adversarial review fixes — binary blacklist, dedup IDs, sentence boundary, remove "check" ([#32](https://github.com/mmmprod/claude-eta/issues/32)) ([bde0feb](https://github.com/mmmprod/claude-eta/commit/bde0feb589f5a4ca9de4f16c7f4156bae777373c))
* **anonymize:** salt projectHash, move contributor ID to CLAUDE_PLUGIN_DATA ([#49](https://github.com/mmmprod/claude-eta/issues/49)) ([5887e37](https://github.com/mmmprod/claude-eta/commit/5887e37ff59094fdbe215955968af9569c55cb72))
* batch P0–P3 improvements ([#25](https://github.com/mmmprod/claude-eta/issues/25)) ([3f44659](https://github.com/mmmprod/claude-eta/commit/3f4465958c8d6cdb81f223e4e76e1e46c70c61df))
* bullshit detector skips past-tense durations ([#30](https://github.com/mmmprod/claude-eta/issues/30)) ([cb9358f](https://github.com/mmmprod/claude-eta/commit/cb9358ff2c306c402f5c36b45fbc86033b1bdc66))
* closeTurn advisory lock + sort completed turns (P1 [#4](https://github.com/mmmprod/claude-eta/issues/4), [#6](https://github.com/mmmprod/claude-eta/issues/6)) ([#50](https://github.com/mmmprod/claude-eta/issues/50)) ([ae47b07](https://github.com/mmmprod/claude-eta/commit/ae47b07368c9db2f1c38f5e748e4e61d764609a8))
* correct install commands in README ([#11](https://github.com/mmmprod/claude-eta/issues/11)) ([bdf165c](https://github.com/mmmprod/claude-eta/commit/bdf165c9a2bc3d8ec5b2fd25eb91084d48110f8f))
* migrate CLI surface (export/compare/contribute) to v2 data layer ([#52](https://github.com/mmmprod/claude-eta/issues/52)) ([1fb678c](https://github.com/mmmprod/claude-eta/commit/1fb678cef6a675896bde6be6bb7bf288e827c4aa))
* persist Auto-ETA accuracy instead of discarding it ([#51](https://github.com/mmmprod/claude-eta/issues/51)) ([a6ea63c](https://github.com/mmmprod/claude-eta/commit/a6ea63cb2697b19a7c980e6cda522d272866b075))
* search both legacy paths for v1 data during migration ([#48](https://github.com/mmmprod/claude-eta/issues/48)) ([b6c87c8](https://github.com/mmmprod/claude-eta/commit/b6c87c89869e6924b84e28a3d4f7676e57de913f))
* ship compiled plugin runtime ([#13](https://github.com/mmmprod/claude-eta/issues/13)) ([ee9e2d9](https://github.com/mmmprod/claude-eta/commit/ee9e2d9cbb3004cabd886c5b7eadb68561258721))

## [0.10.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.9.2...claude-eta-v0.10.0) (2026-03-21)


### Features

* **classify:** multilingual prompt classification (FR) + standalone admin dashboard ([#57](https://github.com/mmmprod/claude-eta/issues/57)) ([543e955](https://github.com/mmmprod/claude-eta/commit/543e9552e72e6f6f4d0f10792e2d667dee767698))

## [0.9.2](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.9.1...claude-eta-v0.9.2) (2026-03-21)


### Bug Fixes

* closeTurn advisory lock + sort completed turns (P1 [#4](https://github.com/mmmprod/claude-eta/issues/4), [#6](https://github.com/mmmprod/claude-eta/issues/6)) ([#50](https://github.com/mmmprod/claude-eta/issues/50)) ([ae47b07](https://github.com/mmmprod/claude-eta/commit/ae47b07368c9db2f1c38f5e748e4e61d764609a8))
* search both legacy paths for v1 data during migration ([#48](https://github.com/mmmprod/claude-eta/issues/48)) ([b6c87c8](https://github.com/mmmprod/claude-eta/commit/b6c87c89869e6924b84e28a3d4f7676e57de913f))

## [0.9.1](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.9.0...claude-eta-v0.9.1) (2026-03-20)


### Bug Fixes

* **anonymize:** salt projectHash, move contributor ID to CLAUDE_PLUGIN_DATA ([#49](https://github.com/mmmprod/claude-eta/issues/49)) ([5887e37](https://github.com/mmmprod/claude-eta/commit/5887e37ff59094fdbe215955968af9569c55cb72))
* migrate CLI surface (export/compare/contribute) to v2 data layer ([#52](https://github.com/mmmprod/claude-eta/issues/52)) ([1fb678c](https://github.com/mmmprod/claude-eta/commit/1fb678cef6a675896bde6be6bb7bf288e827c4aa))

## [0.9.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.8.1...claude-eta-v0.9.0) (2026-03-20)


### Features

* **hooks:** implement SubagentStart/Stop for subagent turn tracking ([#47](https://github.com/mmmprod/claude-eta/issues/47)) ([46cd7c6](https://github.com/mmmprod/claude-eta/commit/46cd7c60798266336dd20e763d5b96bcc397a511))

## [0.8.1](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.8.0...claude-eta-v0.8.1) (2026-03-20)


### Bug Fixes

* persist Auto-ETA accuracy instead of discarding it ([#51](https://github.com/mmmprod/claude-eta/issues/51)) ([a6ea63c](https://github.com/mmmprod/claude-eta/commit/a6ea63cb2697b19a7c980e6cda522d272866b075))

## [0.8.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.7.0...claude-eta-v0.8.0) (2026-03-20)


### Features

* /eta admin-export — full admin dashboard JSON + standalone HTML viewer ([#43](https://github.com/mmmprod/claude-eta/issues/43)) ([004057f](https://github.com/mmmprod/claude-eta/commit/004057fc8904aa3c8640c885792ebc56cede2ab7))

## [0.7.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.6.0...claude-eta-v0.7.0) (2026-03-20)


### Features

* v2 event-log architecture — fixes 7 structural defects ([#41](https://github.com/mmmprod/claude-eta/issues/41)) ([da41400](https://github.com/mmmprod/claude-eta/commit/da4140010299981d3f111648c8f075da3911822c))

## [0.6.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.5.0...claude-eta-v0.6.0) (2026-03-20)


### Features

* /eta insights — 9 deep analyses on dormant task data ([#39](https://github.com/mmmprod/claude-eta/issues/39)) ([5b0a619](https://github.com/mmmprod/claude-eta/commit/5b0a61931e056d61e9bf769778920cf264237c87))

## [0.5.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.4.0...claude-eta-v0.5.0) (2026-03-20)


### Features

* /eta auto — opt-in time estimates at response start ([#37](https://github.com/mmmprod/claude-eta/issues/37)) ([caece8d](https://github.com/mmmprod/claude-eta/commit/caece8d2e10a33782b5b2d6b3854c32e4506a04d))

## [0.4.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.3.4...claude-eta-v0.4.0) (2026-03-20)


### Features

* /eta recap daily journal + BS detector estimates-only filter ([#35](https://github.com/mmmprod/claude-eta/issues/35)) ([9025447](https://github.com/mmmprod/claude-eta/commit/9025447f2fa73ed6ddb6994627752d5b93b2dc09))

## [0.3.4](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.3.3...claude-eta-v0.3.4) (2026-03-20)


### Bug Fixes

* adversarial review fixes — binary blacklist, dedup IDs, sentence boundary, remove "check" ([#32](https://github.com/mmmprod/claude-eta/issues/32)) ([bde0feb](https://github.com/mmmprod/claude-eta/commit/bde0feb589f5a4ca9de4f16c7f4156bae777373c))

## [0.3.3](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.3.2...claude-eta-v0.3.3) (2026-03-20)


### Bug Fixes

* bullshit detector skips past-tense durations ([#30](https://github.com/mmmprod/claude-eta/issues/30)) ([cb9358f](https://github.com/mmmprod/claude-eta/commit/cb9358ff2c306c402f5c36b45fbc86033b1bdc66))

## [0.3.2](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.3.1...claude-eta-v0.3.2) (2026-03-19)


### Bug Fixes

* batch P0–P3 improvements ([#25](https://github.com/mmmprod/claude-eta/issues/25)) ([3f44659](https://github.com/mmmprod/claude-eta/commit/3f4465958c8d6cdb81f223e4e76e1e46c70c61df))

## [0.3.1](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.3.0...claude-eta-v0.3.1) (2026-03-19)


### Bug Fixes

* add fetch timeout and cache-first logic to community features ([#23](https://github.com/mmmprod/claude-eta/issues/23)) ([7e1f178](https://github.com/mmmprod/claude-eta/commit/7e1f17827022c9f2906ef7045e7bf269a497c790))

## [0.3.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.2.0...claude-eta-v0.3.0) (2026-03-19)


### Features

* add community baselines and contribution flow ([#19](https://github.com/mmmprod/claude-eta/issues/19)) ([601809b](https://github.com/mmmprod/claude-eta/commit/601809b6572a04dc99a1db49e75767210b3c66f7))
* improve calibration UX and feedback flow ([#17](https://github.com/mmmprod/claude-eta/issues/17)) ([f22238c](https://github.com/mmmprod/claude-eta/commit/f22238cbd05f7b69147be2425799141213860038))

## [0.2.0](https://github.com/mmmprod/claude-eta/compare/claude-eta-v0.1.1...claude-eta-v0.2.0) (2026-03-19)


### Features

* implement MVP tracking — prompt classification, tool counting, /eta CLI ([1a43d27](https://github.com/mmmprod/claude-eta/commit/1a43d27a8d49f3ba66639238f69b872f5f6d6071))
* passive velocity context at session start ([597b47f](https://github.com/mmmprod/claude-eta/commit/597b47fd603a9ff81004f8fa9c33c16b09257d60))
* pre-emptive context injection — calibrate Claude with project velocity stats ([7a707cf](https://github.com/mmmprod/claude-eta/commit/7a707cfd44de69ebc64669f997487e2b350731d9))


### Bug Fixes

* correct install commands in README ([#11](https://github.com/mmmprod/claude-eta/issues/11)) ([bdf165c](https://github.com/mmmprod/claude-eta/commit/bdf165c9a2bc3d8ec5b2fd25eb91084d48110f8f))
* ship compiled plugin runtime ([#13](https://github.com/mmmprod/claude-eta/issues/13)) ([ee9e2d9](https://github.com/mmmprod/claude-eta/commit/ee9e2d9cbb3004cabd886c5b7eadb68561258721))
