import { heading } from './layout.mjs';
export function architecture() {
  return (
    heading(
      'A WALK THROUGH THE SYSTEM',
      'The loop behind every decision.',
      'A real simulator. A learning agent. A feedback loop you can inspect.'
    ) +
    '<section class="panel architecture"><div class="flow-top"><article class="flow-node"><div class="eyebrow">ENVIRONMENT / BATTERYENV</div><h2>The simulated home</h2><p>Demand + solar + electricity price<br>Battery capacity: 10 kWh<br>Actions advance time by 1 hour.</p></article><div class="flow-arrow">→</div><article class="flow-node"><div class="eyebrow">OBSERVATION → STATE</div><h2>What the agent sees</h2><p>Hour of day × battery charge bucket × net demand bucket = 792 states.<br>No future actual values are exposed.</p></article><div class="flow-arrow">→</div><article class="flow-node highlight"><div class="eyebrow">AGENT / Q-TABLE</div><h2>Choose an action</h2><p>Charge, idle, or discharge.<br>Explore with probability ε.<br>Otherwise choose the highest Q-value.</p></article></div><div class="flow-return">← Apply action → enforce physical limits → calculate reward + next state → update Q(s,a) → repeat for 168 hours ↺</div><div class="flow-bottom"><article><h3>What gets learned?</h3><p>A <span class="keyword">Q-value</span> estimates the discounted future return of taking an action in a state. The <span class="keyword">Bellman update</span> adjusts that estimate using the reward and best next-state value. Terminal transitions do not bootstrap.</p></article><article><h3>What creates the reward?</h3><p><span class="keyword">r = −(grid bill + wear + settlement)</span><br>Charge/discharge limits and efficiency are enforced directly in the simulator. End-of-week settlement values remaining battery energy relative to its starting charge.</p></article><article><h3>How training reaches the dashboard</h3><p>A browser <span class="keyword">Web Worker</span> runs the simulator and Q-learning off the main thread. Every 25 episodes it sends a Q-table snapshot, training mean, validation return, and exploration rate to the UI.</p></article><article><h3>How we check the result</h3><p>Freeze exploration at zero. Run the learned policy, a rule-based controller, and no battery on the same held-out weeks. Repeat training across five seeds to measure variability.</p></article></div></section><div class="info-strip neutral"><strong>Deliberately small.</strong><span>Tabular Q-learning has no neural network or backpropagation. The microgrid also has a Python Gymnasium environment and an offline Stable-Baselines3 DQN comparison, verified against the browser physics.</span></div>'
  );
}
const terms = [
  [
    'Environment',
    'The system the agent interacts with. It defines observations, actions, transitions, and rewards.',
    'Here: the house, grid, solar panels, and battery.',
  ],
  [
    'Agent',
    'The decision maker that learns from its interactions with the environment.',
    'Here: the Q-learning controller.',
  ],
  [
    'Observation',
    'Information available to the agent at the current step. It should not leak future outcomes.',
    'Here: current time, charge, and net demand.',
  ],
  [
    'State',
    'A representation used to make decisions. In an ideal Markov state, it contains everything needed to predict the next transition.',
    'Here: 792 discrete states; an approximation because weather has hidden variation.',
  ],
  [
    'Action',
    'A choice the agent can make in the environment.',
    'Charge (0), idle (1), or discharge (2).',
  ],
  [
    'Reward',
    'Immediate numerical feedback after taking an action. It expresses the objective.',
    'Negative electricity cost, battery wear, and terminal settlement.',
  ],
  [
    'Return',
    'The sum of rewards over a trajectory; the learning objective may discount future rewards.',
    'Plots show undiscounted weekly return; Q-learning uses γ = 0.97.',
  ],
  [
    'Policy',
    'The rule that maps a state or observation to an action.',
    'Greedy evaluation chooses the largest learned Q-value.',
  ],
  [
    'Episode',
    'One complete interaction sequence, ending at a defined terminal condition.',
    'One episode is seven days, or 168 hourly steps.',
  ],
  [
    'Transition',
    'One experience tuple: state, action, reward, next state, and whether the episode ended.',
    'A charge decision changes SOC and returns a cost.',
  ],
  [
    'Q-value',
    'An estimate of discounted future return for taking an action in a state and then following the policy.',
    'Each of the 792 states has three learned action values.',
  ],
  [
    'Q-learning',
    'An off-policy temporal-difference algorithm that learns action values from transitions.',
    'This MVP updates a table, rather than a neural network.',
  ],
  [
    'Exploration / exploitation',
    'Exploration tries actions to learn; exploitation uses the current best estimate.',
    'ε decays from 1.00 to 0.05 during training.',
  ],
  [
    'Learning rate / α',
    'Controls how much each new experience changes the current value estimate.',
    'α = 0.25 in the battery sandbox.',
  ],
  [
    'Discount factor / γ',
    'Controls how much future rewards count relative to immediate rewards.',
    'γ = 0.97 encourages planning beyond the current hour.',
  ],
  [
    'TD error',
    'The difference between the current value estimate and a reward-plus-next-value target.',
    'δ = r + γ max Q(s′,a′) − Q(s,a), except at terminal steps.',
  ],
  [
    'Baseline',
    'A reference controller used to judge whether learning adds value.',
    'No battery and a tariff-aware rule-based controller.',
  ],
  [
    'Random seed',
    'A value that makes randomized scenarios and training choices reproducible.',
    'Training seeds 42–46; evaluation uses separate fixed seeds.',
  ],
  [
    'Generalization',
    'Whether a learned policy works on scenarios it did not train on.',
    'Evaluate on 20 held-out weeks, plus inspect cloudy replay conditions.',
  ],
  [
    'Reward hacking',
    'Behavior that maximizes the written reward while missing the intended goal.',
    'Physical limits prevent impossible energy; terminal settlement discourages free initial energy.',
  ],
  [
    'Bellman equation',
    'Relates the value of a state or action to immediate reward and future value. Q-learning uses a sampled version of this relationship.',
    'Target: r + γ max Q(s′,a′), or just r at episode end.',
  ],
  [
    'Off-policy learning',
    'Learns about a target policy using experience collected by a different behavior policy.',
    'Q-learning learns greedy action values from ε-greedy exploration.',
  ],
  [
    'On-policy learning',
    'Learns about the policy currently collecting experience.',
    'A contrast to the battery sandbox; methods such as SARSA use the next action actually selected.',
  ],
  [
    'Markov decision process / MDP',
    'A model described by states, actions, transition probabilities, rewards, and a discount factor.',
    'Our discrete observation is approximate: it omits day index and hidden weather variation.',
  ],
  [
    'Function approximation',
    'Represents values or a policy with a parameterized function rather than storing every state in a table.',
    'DQN would use a neural network in place of our 2,376 table entries.',
  ],
  [
    'Replay buffer',
    'Stores past transitions so an algorithm can sample and reuse experience.',
    'Common in DQN and SAC; this online tabular agent has no replay buffer.',
  ],
  [
    'PPO',
    'Proximal policy optimization: a policy-gradient method that limits the scale of policy updates.',
    'Another possible future comparison; not implemented in the battery sandbox.',
  ],
  [
    'DQN',
    'Deep Q-network: approximates Q-values with a neural network instead of a table, commonly using replay and target networks.',
    'Implemented offline in Python with Stable-Baselines3; browser training remains tabular Q-learning.',
  ],
  [
    'SAC',
    'Soft actor-critic: an off-policy actor-critic method often used for continuous control.',
    'A future extension for continuous battery power decisions.',
  ],
];
export function glossary() {
  return (
    heading(
      'YOUR RL FIELD GUIDE',
      'Learn the language of the loop.',
      'The concepts you’ll need to explain this project in a demo or an interview.',
      '<input class="glossary-search" id="search" type="search" placeholder="Find a concept…" aria-label="Search RL concepts">'
    ) +
    '<div class="glossary-grid" id="terms">' +
    termCards('') +
    '</div>'
  );
}
export function termCards(query) {
  const found = terms.filter((t) =>
    t.join(' ').toLowerCase().includes(query.toLowerCase())
  );
  return found.length
    ? found
        .map(
          ([name, description, example], i) =>
            '<article class="glossary-card"><span class="tiny-label">RL / ' +
            String(i + 1).padStart(2, '0') +
            '</span><h2>' +
            name +
            '</h2><p>' +
            description +
            '</p><div class="example">' +
            example +
            '</div></article>'
        )
        .join('')
    : '<p class="subtext">No matching concepts. Try “reward” or “policy”.</p>';
}
