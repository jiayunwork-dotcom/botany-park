export interface InteractionInfo {
  type: 'pollination' | 'symbiosis' | 'competition' | 'allelopathy';
  name: string;
  description: string;
  effect: string;
  partners?: string[];
  targets?: string[];
  group?: string;
}

export const ECOLOGY_INTERACTIONS: InteractionInfo[] = [
  {
    type: 'pollination',
    name: '授粉互助',
    description: '相邻花卉互相吸引更多传粉昆虫，提升结实率',
    effect: '种子产量+30%，观赏价值+10%',
    partners: ['rose', 'lavender', 'sunflower', 'marigold']
  },
  {
    type: 'symbiosis',
    name: '共生固氮',
    description: '固氮植物（如三叶草）为邻近植物提供氮肥',
    effect: '相邻植物生长速度+20%',
    partners: ['clover', 'grape', 'oak']
  },
  {
    type: 'competition',
    name: '光照竞争',
    description: '同类高大乔木相邻时互相遮光',
    effect: '双方光照适宜度各减15%',
    group: 'tall_trees'
  },
  {
    type: 'allelopathy',
    name: '化感抑制',
    description: '某些植物释放化学物质抑制邻近植物生长',
    effect: '邻近植物生长速度-30%',
    partners: ['marigold']
  }
];
