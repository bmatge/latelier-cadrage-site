import { describe, it, expect } from 'vitest';
import {
  normalizeUserStories,
  blockRef,
  parseBlockRef,
  EMPTY_USER_STORIES,
  DEFAULT_PARCOURS_ID,
  DEFAULT_PARCOURS_LABEL,
  type UserStoriesData,
} from './user-stories.js';

describe('normalizeUserStories', () => {
  it('renvoie EMPTY pour null/undefined/non-objet', () => {
    expect(normalizeUserStories(null)).toEqual(EMPTY_USER_STORIES);
    expect(normalizeUserStories(undefined)).toEqual(EMPTY_USER_STORIES);
    expect(normalizeUserStories('foo')).toEqual(EMPTY_USER_STORIES);
    expect(normalizeUserStories(42)).toEqual(EMPTY_USER_STORIES);
  });

  it('renvoie parcours vides si absent', () => {
    expect(normalizeUserStories({})).toEqual({ parcours: [] });
    expect(normalizeUserStories({ parcours: null })).toEqual({ parcours: [] });
  });

  it('accepte le nouveau format { parcours: [...] }', () => {
    const out = normalizeUserStories({
      parcours: [
        { id: 'p1', label: 'Onboarding', description: 'Premier pas', stories: [] },
        { id: 'p2', label: 'Réclamation', stories: [{ id: 's1', label: 'Story' }] },
      ],
    });
    expect(out.parcours).toHaveLength(2);
    expect(out.parcours[0]!.id).toBe('p1');
    expect(out.parcours[0]!.description).toBe('Premier pas');
    expect(out.parcours[1]!.stories).toHaveLength(1);
  });

  it('migre legacy { stories: [...] } dans un parcours par défaut', () => {
    const out = normalizeUserStories({
      stories: [
        { id: 's1', label: 'Story 1' },
        { id: 's2', label: 'Story 2' },
      ],
    });
    expect(out.parcours).toHaveLength(1);
    expect(out.parcours[0]!.id).toBe(DEFAULT_PARCOURS_ID);
    expect(out.parcours[0]!.label).toBe(DEFAULT_PARCOURS_LABEL);
    expect(out.parcours[0]!.stories).toHaveLength(2);
  });

  it('rejette les parcours sans id', () => {
    const out = normalizeUserStories({ parcours: [{ label: 'Sans id', stories: [] }] });
    expect(out.parcours).toHaveLength(0);
  });

  it("rejette les stories sans id à l'intérieur d'un parcours", () => {
    const out = normalizeUserStories({
      parcours: [{ id: 'p1', label: 'P', stories: [{ label: 'Sans id' }] }],
    });
    expect(out.parcours[0]!.stories).toHaveLength(0);
  });

  it('garde les stories valides avec valeurs par défaut', () => {
    const out = normalizeUserStories({
      parcours: [{ id: 'p1', label: 'P', stories: [{ id: 's1', label: 'Test' }] }],
    });
    expect(out.parcours[0]!.stories).toHaveLength(1);
    const s = out.parcours[0]!.stories[0]!;
    expect(s.id).toBe('s1');
    expect(s.label).toBe('Test');
    expect(s.steps).toEqual([]);
  });

  it('normalise les screens des 4 kinds', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            {
              id: 's1',
              label: 'Test',
              steps: [
                {
                  id: 'st1',
                  screen: { kind: 'ghost', ref: null, title: 'Page X' },
                  action: 'a',
                  comment: 'c',
                },
                { id: 'st2', screen: { kind: 'node', ref: 'node-42' }, action: '', comment: '' },
                {
                  id: 'st3',
                  screen: { kind: 'block', ref: 'node-42#p1' },
                  action: '',
                  comment: '',
                },
                {
                  id: 'st4',
                  screen: { kind: 'dispositif', ref: 'disp-1' },
                  action: '',
                  comment: '',
                },
              ],
            },
          ],
        },
      ],
    });
    const s = out.parcours[0]!.stories[0]!;
    expect(s.steps).toHaveLength(4);
    expect(s.steps[0]!.screen.kind).toBe('ghost');
    expect(s.steps[0]!.screen.title).toBe('Page X');
    expect(s.steps[1]!.screen.kind).toBe('node');
    expect(s.steps[2]!.screen.kind).toBe('block');
    expect(s.steps[3]!.screen.kind).toBe('dispositif');
  });

  it('rejette un screen kind inconnu', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            {
              id: 's1',
              label: 'T',
              steps: [{ id: 'st1', screen: { kind: 'bogus', ref: 'x' }, action: '', comment: '' }],
            },
          ],
        },
      ],
    });
    expect(out.parcours[0]!.stories[0]!.steps).toHaveLength(0);
  });

  it('accepte les branches profondeur 1', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            {
              id: 's1',
              label: 'T',
              steps: [
                {
                  id: 'st1',
                  screen: { kind: 'node', ref: 'n1' },
                  action: '',
                  comment: '',
                  branches: [
                    {
                      id: 'b1',
                      condition: 'Si éligible',
                      steps: [
                        { id: 'st2', screen: { kind: 'node', ref: 'n2' }, action: '', comment: '' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const step = out.parcours[0]!.stories[0]!.steps[0]!;
    expect(step.branches).toHaveLength(1);
    expect(step.branches![0]!.condition).toBe('Si éligible');
    expect(step.branches![0]!.steps).toHaveLength(1);
  });

  it('ignore une 2e profondeur de branchement (LeafStep ne porte pas branches)', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            {
              id: 's1',
              label: 'T',
              steps: [
                {
                  id: 'st1',
                  screen: { kind: 'node', ref: 'n1' },
                  action: '',
                  comment: '',
                  branches: [
                    {
                      id: 'b1',
                      condition: 'Si X',
                      steps: [
                        {
                          id: 'st2',
                          screen: { kind: 'node', ref: 'n2' },
                          action: '',
                          comment: '',
                          branches: [{ id: 'b2', condition: 'Si Y', steps: [] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const innerStep = out.parcours[0]!.stories[0]!.steps[0]!.branches![0]!.steps[0]! as unknown as {
      branches?: unknown;
    };
    expect(innerStep.branches).toBeUndefined();
  });

  it('accepte audience_key sur la story', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [{ id: 's1', label: 'T', audience_key: 'particuliers' }],
        },
      ],
    });
    expect(out.parcours[0]!.stories[0]!.audience_key).toBe('particuliers');
  });

  it('accepte theme_key sur le screen', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            {
              id: 's1',
              label: 'T',
              steps: [
                {
                  id: 'st1',
                  screen: { kind: 'node', ref: 'n1', theme_key: 'navigation' },
                  action: '',
                  comment: '',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(out.parcours[0]!.stories[0]!.steps[0]!.screen.theme_key).toBe('navigation');
  });

  it('migre legacy story.theme_key vers les screens sans theme explicite', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            {
              id: 's1',
              label: 'T',
              theme_key: 'information', // legacy : sur la story
              steps: [
                { id: 'st1', screen: { kind: 'node', ref: 'n1' }, action: '', comment: '' },
                {
                  id: 'st2',
                  screen: { kind: 'node', ref: 'n2', theme_key: 'action' },
                  action: '',
                  comment: '',
                },
              ],
            },
          ],
        },
      ],
    });
    const story = out.parcours[0]!.stories[0]!;
    expect(story.steps[0]!.screen.theme_key).toBe('information');
    expect(story.steps[1]!.screen.theme_key).toBe('action');
    expect((story as { theme_key?: string }).theme_key).toBeUndefined();
  });

  it('persiste le flag collapsed sur la story', () => {
    const out = normalizeUserStories({
      parcours: [
        {
          id: 'p1',
          label: 'P',
          stories: [
            { id: 's1', label: 'T', collapsed: true },
            { id: 's2', label: 'U', collapsed: false },
            { id: 's3', label: 'V' },
          ],
        },
      ],
    });
    expect(out.parcours[0]!.stories[0]!.collapsed).toBe(true);
    expect(out.parcours[0]!.stories[1]!.collapsed).toBe(false);
    expect(out.parcours[0]!.stories[2]!.collapsed).toBe(false);
  });

  it('persiste les champs description et collapsed du parcours', () => {
    const out = normalizeUserStories({
      parcours: [{ id: 'p1', label: 'P', description: 'Desc', collapsed: true, stories: [] }],
    });
    expect(out.parcours[0]!.description).toBe('Desc');
    expect(out.parcours[0]!.collapsed).toBe(true);
  });

  it('roundtrip : normaliser deux fois est idempotent', () => {
    const input: UserStoriesData = {
      parcours: [
        {
          id: 'p1',
          label: 'Onboarding',
          description: 'Premiers usages',
          collapsed: false,
          stories: [
            {
              id: 's1',
              label: 'Test',
              audience_key: 'pros',
              description: 'desc',
              collapsed: true,
              steps: [
                {
                  id: 'st1',
                  screen: {
                    kind: 'block',
                    ref: 'n1#p1',
                    title: 'Bloc CTA',
                    theme_key: 'action',
                  },
                  action: 'cliquer',
                  comment: 'attention au libellé',
                },
              ],
            },
          ],
        },
      ],
    };
    const once = normalizeUserStories(input);
    const twice = normalizeUserStories(once);
    expect(twice).toEqual(once);
  });
});

describe('blockRef / parseBlockRef', () => {
  it('construit une ref bloc valide', () => {
    expect(blockRef('node-1', 'p-abc')).toBe('node-1#p-abc');
  });

  it('parse une ref bloc valide', () => {
    expect(parseBlockRef('node-1#p-abc')).toEqual({ nodeId: 'node-1', paragraphId: 'p-abc' });
  });

  it('renvoie null pour une ref sans #', () => {
    expect(parseBlockRef('node-1')).toBeNull();
  });

  it('renvoie null pour une ref avec # en début/fin', () => {
    expect(parseBlockRef('#abc')).toBeNull();
    expect(parseBlockRef('abc#')).toBeNull();
  });
});
