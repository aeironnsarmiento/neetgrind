# How NeetGrind orders your questions

NeetGrind's default **Recommended** order combines the best parts of three popular prep resources with what learning research says about practice. This page summarizes that research and how the order uses it.

> **Caveat:** no study has tested this on LeetCode-style interview prep. The findings below come from mathematics, category learning and memory research. Treat the exact numbers in the algorithm as reasonable defaults, not proven values.

## TL;DR

1. **Start each topic with a short run of its own questions**, easy → medium, in prerequisite order.
2. **Then bring earlier topics back mixed together and spaced out**, with look-alike patterns next to each other.
3. **Finish with fully mixed practice**, like a real interview.
4. **Solve from a blank editor.** Re-reading a solution is not practice.

## What popular resources do

| | Structure | Within a topic | Returns to earlier topics? |
|---|---|---|---|
| **[NeetCode](https://neetcode.io/roadmap)** | One topic at a time, following a prerequisite graph | Roughly easy → hard | No |
| **[Grokking the Coding Interview](https://www.designgurus.io/course/grokking-the-coding-interview)** | One pattern at a time (Two Pointers → Fast/Slow → Sliding Window → Intervals → …) | Mostly easy → hard | At the end (Revision + mixed tests) |
| **[Grind 75](https://www.techinterviewhandbook.org/grind75)** default | By difficulty: all Easies first (topics mixed), then Mediums, then Hards | By importance | Yes, topics recur across weeks |

- **NeetCode** describes its roadmap as a prerequisite graph ("each problem builds on the previous ones").
- **Grokking** puts the highest-yield array patterns first and goes easy to hard.
- **Grind 75**'s author says Easy questions "impart core algorithmic patterns," and that mixing topics each week gives spaced repetition. His [study plan guide](https://www.techinterviewhandbook.org/coding-interview-study-plan/) recommends "breadth-first" or "depth-first-then-breadth" (a few questions per topic, then mixed practice).

Each resource gets one part right. None combines introducing topics one at a time with spaced, mixed review.

## What learning research says

### Mixing topics beats one topic at a time for long-term learning

Solving A-A-A then B-B-B feels productive. On a later test, mixing A-B-C-A-C-B does better.

| Study | Result |
|---|---|
| Kornell & Bjork 2008 | 61% vs 35% (d ≈ 1.0). 78% of learners did better mixed, yet most *believed* one-at-a-time was better. |
| Rohrer, Dedrick & Burgess 2014 (classroom maths) | 72% vs 38% on a delayed test |
| Rohrer et al. 2020 (preregistered, 54 classes) | 61% vs 38% (d = 0.83) |
| Brunmair & Richter 2019 (meta-analysis, 59 studies) | Overall g ≈ 0.42 (≈ 0.29 after correcting for publication bias); maths tasks g ≈ 0.34 |

**Why it matters for interviews:** mixing trains you to recognise *which* strategy a problem needs. An interview problem never says "use a sliding window." When you practise one topic at a time, the topic tells you the answer.

Mixing helps most between **patterns that look alike**, and adds little between very different ones.

### But start a new topic with a short run of its own questions

- Beginners do better with guided practice on one topic at first (worked-example and cognitive-load research: Sweller 1988; Renkl & Atkinson 2003). Guidance that helps beginners can hurt experienced learners (Kalyuga et al. 2003).
- Starting with a short run on one topic, then mixing, did **as well as** mixing from the start, and learners liked it more (Yan et al. 2017). For struggling learners, the hybrid did best (Hwang 2024).
- In classroom studies, the best results came when **at least two-thirds** of practice was spaced or mixed (Rohrer & Hartwig).

### Spacing and solving from memory matter even more

- **Solving from memory beats re-reading.** After a week, people who only re-read forgot 52%; people who tested themselves forgot 10% (Roediger & Karpicke 2006).
- **Spaced beats crammed.** Spaced retrieval practice has a large effect, g ≈ 0.74 (Latimier et al. 2021).
- **Exact gaps don't matter much.** Fixed and growing intervals performed the same (Latimier et al. 2021). The best gap grows with how far away the test is (Cepeda et al. 2006, 2008).
- Real-course effects are smaller and less consistent than lab effects (Bego et al. 2024).

### Harder practice can mean better learning

Mixing, spacing and self-testing make practice *feel* worse while improving retention (Bjork's "desirable difficulties"). In an 8-week physics course, mixed homework raised test scores a lot, yet students rated it harder and thought they'd learned less (Samani & Pan 2021).

If the Recommended order feels harder than going topic by topic, that's expected.

## How the Recommended order uses this

Grind 75 still picks *which* questions and how many hours they take. Recommended only changes *when* each one appears.

| Rule | Based on |
|---|---|
| Topics are introduced in NeetCode roadmap order | Prerequisites (NeetCode) |
| Each topic starts with 2 questions in a row (3 on plans of 10+ weeks), easiest first, no Hards | Short single-topic start; easy → hard |
| Week 1 is new topics only | Beginners do better with guided, single-topic practice |
| After that, about ⅓ new topics and ⅔ review | Rohrer & Hartwig's "at least two-thirds" |
| A topic is reviewed only after a few days | Spacing |
| Look-alike patterns are placed next to each other (e.g. Two Pointers / Sliding Window / Binary Search; Trees / Graphs / Backtracking; Greedy / DP) | Mixing helps most between similar patterns |
| The same topic isn't repeated back to back | Keep it mixed |
| Hards appear only after a topic has had a review | Don't add difficulty before the basics are in place |
| The last ~20% of the plan (at least a week) is fully mixed | Interview conditions |
| Review questions show **"Review"** instead of their topic | You have to spot the pattern, as in an interview |

The code is in [`src/core/recommended.js`](../src/core/recommended.js).

## What about redoing the same question (Anki-style)?

It helps, but only for questions you struggled with.

- Re-solving the same problem mostly makes you better at *that problem*. Handling new problems comes from varied practice, which the Review slots provide by using a *different* question from the same topic.
- A reasonable rule:

| First attempt | Redo |
|---|---|
| Clean, in time | Not needed |
| Slow or buggy | Once, ~1 week later |
| Needed hints | ~3 days, then ~10 days |
| Read the solution | Next day, ~4 days, ~2 weeks |

Always redo from a blank editor with a timer.

NeetGrind doesn't schedule redos yet, because NeetCode only records done / not done.

## References

- Bego, C. et al. (2024). *International Journal of STEM Education*, 11:9. doi:10.1186/s40594-024-00468-5
- Bjork, E. L. & Bjork, R. A. (2011). Making things hard on yourself, but in a good way. In *Psychology and the Real World*.
- Brunmair, M. & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning. *Psychological Bulletin*. doi:10.1037/bul0000209
- Cepeda, N. J. et al. (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin*, 132, 354–380.
- Cepeda, N. J. et al. (2008). Spacing effects in learning. *Psychological Science*, 19, 1095–1102.
- Hwang, H. (2024). *Language Learning*. doi:10.1111/lang.12659
- Kalyuga, S., Ayres, P., Chandler, P. & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist*, 38, 23–31.
- Kornell, N. & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science*, 19, 585–592.
- Latimier, A., Peyre, H. & Ramus, F. (2021). A meta-analytic review of the benefit of spacing out retrieval practice episodes on retention. *Educational Psychology Review*. doi:10.1007/s10648-020-09572-8
- Renkl, A. & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving. *Educational Psychologist*, 38, 15–22.
- Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*, 17, 249–255.
- Rohrer, D., Dedrick, R. F. & Burgess, K. (2014). The benefit of interleaved mathematics practice is not limited to superficially similar kinds of problems. *Psychonomic Bulletin & Review*.
- Rohrer, D., Dedrick, R. F., Hartwig, M. K. & Cheung, C.-N. (2020). A randomized controlled trial of interleaved mathematics practice. *Journal of Educational Psychology*, 112(1). doi:10.1037/edu0000367
- Rohrer, D. & Hartwig, M. K. Spaced and interleaved mathematics practice (teaching guide). [PDF](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-spaced-and-interleaved-mathematics-practice-rohrer-hartwig.pdf)
- Samani, J. & Pan, S. C. (2021). Interleaved practice enhances memory and problem-solving ability in undergraduate physics. *npj Science of Learning*.
- Sweller, J. (1988). Cognitive load during problem solving. *Cognitive Science*, 12, 257–285.
- Yan, V. X., Soderstrom, N. C., Seneviratna, G. S., Bjork, E. L. & Bjork, R. A. (2017). How should exemplars be sequenced in inductive learning? *Journal of Experimental Psychology: Applied*, 23, 403–416.
