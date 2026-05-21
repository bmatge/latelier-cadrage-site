import { describe, it, expect } from 'vitest';
import {
  normalizeUserStories,
  blockRef,
  parseBlockRef,
  EMPTY_USER_STORIES,
  type UserStoriesData,
} from './user-stories.js';

describe('normalizeUserStories', () => {
  it('renvoie EMPTY pour null/undefined/non-objet', () => {
    expect(normalizeUserStories(null)).toEqual(EMPTY_USER_STORIES);
    expect(normalizeUserStories(undefined)).toEqual(EMPTY_USER_STORIES);
    expect(normalizeUserStories('foo')).toEqual(EMPTY_USER_STORIES);
    expect(normalizeUserStories(42)).toEqual(EMPTY_USER_STORIES);
  });

  it('renvoie stories vides si absent', () => {
    expect(normalizeUserStories({})).toEqual({ stories: [] });
    expect(normalizeUserStories({ stories: null })).toEqual({ stories: [] });
  });

  it('rejette les stories sans id', () => {
    const out = normalizeUserStories({ stories: [{ label: 'Sans id' }] });
    expect(out.stories).toHaveLength(0);
  });

  it('garde les stories valides avec valeurs par défaut', () => {
    const out = normalizeUserStories({
      stories: [{ id: 's1', label: 'Test' }],
    });
    expect(out.stories).toHaveLength(1);
    const s = out.stories[0]!;
    expect(s.id).toBe('s1');
    expect(s.label).toBe('Test');
    expect(s.steps).toEqual([]);
  });

  it('normalise les screens des 4 kinds', () => {
    const out = normalizeUserStories({
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
            { id: 'st3', screen: { kind: 'block', ref: 'node-42#p1' }, action: '', comment: '' },
            { id: 'st4', screen: { kind: 'dispositif', ref: 'disp-1' }, action: '', comment: '' },
          ],
        },
      ],
    });
    const s = out.stories[0]!;
    expect(s.steps).toHaveLength(4);
    expect(s.steps[0]!.screen.kind).toBe('ghost');
    expect(s.steps[0]!.screen.title).toBe('Page X');
    expect(s.steps[1]!.screen.kind).toBe('node');
    expect(s.steps[2]!.screen.kind).toBe('block');
    expect(s.steps[3]!.screen.kind).toBe('dispositif');
  });

  it('rejette un screen kind inconnu', () => {
    const out = normalizeUserStories({
      stories: [
        {
          id: 's1',
          label: 'Test',
          steps: [{ id: 'st1', screen: { kind: 'bogus', ref: 'x' }, action: '', comment: '' }],
        },
      ],
    });
    expect(out.stories[0]!.steps).toHaveLength(0);
  });

  it('accepte les branches profondeur 1', () => {
    const out = normalizeUserStories({
      stories: [
        {
          id: 's1',
          label: 'Test',
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
    });
    const step = out.stories[0]!.steps[0]!;
    expect(step.branches).toHaveLength(1);
    expect(step.branches![0]!.condition).toBe('Si éligible');
    expect(step.branches![0]!.steps).toHaveLength(1);
  });

  it('ignore une 2e profondeur de branchement (LeafStep ne porte pas branches)', () => {
    const out = normalizeUserStories({
      stories: [
        {
          id: 's1',
          label: 'Test',
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
                      // 2e niveau de branches : doit être ignoré silencieusement
                      branches: [{ id: 'b2', condition: 'Si Y', steps: [] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const innerStep = out.stories[0]!.steps[0]!.branches![0]!.steps[0]! as unknown as {
      branches?: unknown;
    };
    expect(innerStep.branches).toBeUndefined();
  });

  it('accepte audience_key sur la story', () => {
    const out = normalizeUserStories({
      stories: [{ id: 's1', label: 'T', audience_key: 'particuliers' }],
    });
    expect(out.stories[0]!.audience_key).toBe('particuliers');
  });

  it('accepte theme_key sur le screen', () => {
    const out = normalizeUserStories({
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
    });
    expect(out.stories[0]!.steps[0]!.screen.theme_key).toBe('navigation');
  });

  it('migre legacy story.theme_key vers les screens sans theme explicite', () => {
    const out = normalizeUserStories({
      stories: [
        {
          id: 's1',
          label: 'T',
          theme_key: 'information', // legacy : sur la story
          steps: [
            {
              id: 'st1',
              screen: { kind: 'node', ref: 'n1' }, // hérite
              action: '',
              comment: '',
            },
            {
              id: 'st2',
              screen: { kind: 'node', ref: 'n2', theme_key: 'action' }, // explicite → préservé
              action: '',
              comment: '',
            },
          ],
        },
      ],
    });
    expect(out.stories[0]!.steps[0]!.screen.theme_key).toBe('information');
    expect(out.stories[0]!.steps[1]!.screen.theme_key).toBe('action');
    // La story elle-même ne porte plus theme_key dans le nouveau modèle
    expect((out.stories[0] as { theme_key?: string }).theme_key).toBeUndefined();
  });

  it('persiste le flag collapsed sur la story', () => {
    const out = normalizeUserStories({
      stories: [
        { id: 's1', label: 'T', collapsed: true },
        { id: 's2', label: 'U', collapsed: false },
        { id: 's3', label: 'V' },
      ],
    });
    expect(out.stories[0]!.collapsed).toBe(true);
    expect(out.stories[1]!.collapsed).toBe(false);
    expect(out.stories[2]!.collapsed).toBe(false);
  });

  it('roundtrip : normaliser deux fois est idempotent', () => {
    const input: UserStoriesData = {
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
