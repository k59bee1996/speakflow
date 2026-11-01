import type { Mode } from "./types";

export type ActKey =
  | "shadowing"
  | "flashcard"
  | "selftalk"
  | "tranh"
  | "motphut"
  | "khoidong"
  | "hoidap"
  | "ghiam"
  | "hoithoai"
  | "sobi";

export const ACT: Record<ActKey, { name: string; how: string }> = {
  shadowing: { name: "Shadowing", how: "Chọn đoạn audio 1–2 phút có transcript, nói đuổi theo người nói chậm hơn khoảng nửa giây. Dùng cùng một đoạn trong 3–4 ngày." },
  flashcard: { name: "Ôn thẻ lật ngược", how: "Nhìn câu tiếng Việt, nói to câu tiếng Anh rồi mới lật thẻ." },
  selftalk: { name: "Self-talk", how: "Nói to bằng tiếng Anh những gì bạn đang làm hoặc nghĩ. Bí từ thì nói vòng, đừng dừng lại tra." },
  tranh: { name: "Mô tả tranh", how: "Mở một bức ảnh bất kỳ và mô tả trong 1 phút. Từ nào không biết thì ghi vào sổ câu bí." },
  motphut: { name: "1 phút 1 chủ đề", how: "Bốc chủ đề, 10 giây chuẩn bị, rồi nói đúng 1 phút: quan điểm, lý do, ví dụ, kết luận. Cố dùng 3 cụm của tuần." },
  khoidong: { name: "Khởi động: 1 phút 1 chủ đề", how: "Bốc chủ đề, 10 giây chuẩn bị, rồi nói đúng 1 phút để làm nóng." },
  hoidap: { name: "Hỏi đáp nhanh", how: "Mở chế độ giọng nói trong app Claude, dán câu lệnh dưới đây, trả lời mỗi câu trong vòng 3 giây." },
  ghiam: { name: "Ghi âm và nghe lại", how: "Ghi âm phần nói hôm nay bằng điện thoại, nghe lại, chọn 2–3 lỗi lặp lại để sửa trong tuần." },
  hoithoai: { name: "Hội thoại", how: "Nói chuyện với người thật, hoặc đóng vai với Claude bằng giọng nói với câu lệnh dưới đây." },
  sobi: { name: "Sổ câu bí", how: "Tra cách nói những ý vừa bí, nói to mỗi câu 5 lần, rồi thêm thành thẻ." },
};

export interface Phase {
  name: string;
  title: string;
  color: "p1" | "p2" | "p3";
  s30: [ActKey, number][];
  s60: [ActKey, number][];
}

export const PHASES: Phase[] = [
  {
    name: "Giai đoạn 1", title: "Nạp câu mẫu và từ vựng chủ động", color: "p1",
    s30: [["shadowing", 10], ["flashcard", 10], ["selftalk", 10]],
    s60: [["shadowing", 15], ["flashcard", 15], ["tranh", 5], ["selftalk", 15], ["ghiam", 10]],
  },
  {
    name: "Giai đoạn 2", title: "Nói liên tục và trả lời nhanh", color: "p2",
    s30: [["flashcard", 5], ["motphut", 10], ["hoidap", 15]],
    s60: [["shadowing", 5], ["flashcard", 10], ["motphut", 15], ["hoidap", 20], ["ghiam", 10]],
  },
  {
    name: "Giai đoạn 3", title: "Hội thoại thật", color: "p3",
    s30: [["flashcard", 5], ["hoithoai", 20], ["sobi", 5]],
    s60: [["khoidong", 10], ["flashcard", 10], ["hoithoai", 30], ["sobi", 10]],
  },
];

export const TOTAL_WEEKS = 12;
export const NEW_PER_DAY = 10;

export function phaseIndex(week: number): number {
  return week <= 4 ? 0 : week <= 8 ? 1 : 2;
}

export function clampWeek(week: number): number {
  return Math.min(Math.max(week, 1), TOTAL_WEEKS);
}

export function activitiesFor(week: number, mode: Mode): [ActKey, number][] {
  const p = PHASES[phaseIndex(clampWeek(week))];
  return mode === "60" ? p.s60 : p.s30;
}

/** Một buổi tính là xong khi làm đủ mọi hoạt động của bản 30 hoặc bản 60 phút. */
export function isSessionComplete(week: number, done: string[]): boolean {
  if (week < 1) return false;
  const p = PHASES[phaseIndex(clampWeek(week))];
  const all = (list: [ActKey, number][]) => list.every(([k]) => done.includes(k));
  return all(p.s30) || all(p.s60);
}

export interface WeekTopic {
  vi: string;
  en: string;
  chunks: string[];
}

export const WEEKS: WeekTopic[] = [
  { vi: "Bản thân và thói quen hằng ngày", en: "daily routines", chunks: ["I usually…", "I’m used to…", "on weekdays", "It takes me about…"] },
  { vi: "Nhà cửa và đồ vật quanh nhà", en: "home and household items", chunks: ["turn on / turn off", "plug in", "run out of…", "It’s next to…"] },
  { vi: "Ăn uống và nấu ăn", en: "food and cooking", chunks: ["I’m craving…", "It tastes a bit…", "eat out", "I’ll have the…"] },
  { vi: "Công việc hoặc việc học", en: "work and study", chunks: ["I’m in charge of…", "meet the deadline", "I’m working on…", "catch up on…"] },
  { vi: "Cảm xúc và tính cách", en: "feelings and personality", chunks: ["I was a bit nervous about…", "It drives me crazy when…", "get along with", "I’m the kind of person who…"] },
  { vi: "Sức khoẻ và vận động", en: "health and exercise", chunks: ["I’ve been feeling…", "get some exercise", "cut down on…", "stay up late"] },
  { vi: "Mua sắm và tiền bạc", en: "shopping and money", chunks: ["It’s a bit pricey", "It’s worth it", "on sale", "I can’t afford…"] },
  { vi: "Du lịch và đi lại", en: "travel and getting around", chunks: ["How do I get to…?", "get stuck in traffic", "book a room", "within walking distance"] },
  { vi: "Công nghệ và mạng xã hội", en: "technology and social media", chunks: ["scroll through", "keep in touch", "I spend too much time on…", "It keeps crashing"] },
  { vi: "Họp hành và xử lý vấn đề", en: "meetings and solving problems at work", chunks: ["Could you clarify…?", "Let me get back to you", "What if we…?", "sort it out"] },
  { vi: "Nêu quan điểm và tranh luận", en: "opinions and debate", chunks: ["I see your point, but…", "It depends on…", "On the other hand…", "I’m not sure I agree"] },
  { vi: "Kế hoạch và mục tiêu", en: "plans and goals", chunks: ["I’m planning to…", "My goal is to…", "in the long run", "I’m looking forward to…"] },
];

/** Bộ thẻ có sẵn: 5 thẻ mỗi tuần. [mặt trước, mặt sau, ghi chú?] */
export const DECK: [string, string, string?][][] = [
  [["Tôi thường dậy lúc 6 giờ.", "I usually get up at 6."], ["Tôi đã quen với việc làm việc từ xa.", "I’m used to working remotely.", "I’m used to + V-ing"], ["Tôi mất khoảng 30 phút để đến công ty.", "It takes me about 30 minutes to get to work."], ["Ngày thường tôi ít khi nấu ăn.", "On weekdays, I rarely cook."], ["Cuối tuần tôi hay ngủ nướng.", "At weekends, I usually sleep in."]],
  [["Bạn bật đèn giúp mình được không?", "Can you turn on the light for me?"], ["Điện thoại tôi sắp hết pin, để tôi cắm sạc.", "My phone is about to die, let me plug it in."], ["Nhà mình hết sữa rồi.", "We’ve run out of milk."], ["Ổ cắm ở cạnh tủ lạnh.", "The socket is next to the fridge."], ["Nhớ tắt quạt trước khi ra ngoài nhé.", "Remember to turn off the fan before you go out."]],
  [["Tôi đang thèm đồ ngọt.", "I’m craving something sweet."], ["Món này hơi cay một chút.", "This tastes a bit spicy."], ["Tối nay mình ra ngoài ăn nhé?", "Shall we eat out tonight?"], ["Cho tôi một phần cơm gà.", "I’ll have the chicken rice, please."], ["Tôi thích nấu ở nhà hơn vì rẻ hơn.", "I prefer cooking at home because it’s cheaper."]],
  [["Tôi phụ trách phần thanh toán.", "I’m in charge of the payment part."], ["Chúng ta cần kịp hạn chót thứ Sáu.", "We need to meet the Friday deadline."], ["Tôi đang làm tính năng đăng nhập.", "I’m working on the login feature."], ["Tôi cần làm bù việc tuần trước.", "I need to catch up on last week’s work."], ["Tôi sẽ cập nhật cho anh sau cuộc họp.", "I’ll update you after the meeting."]],
  [["Tôi hơi lo về buổi thuyết trình.", "I’m a bit nervous about the presentation."], ["Tôi phát điên khi mạng bị chậm.", "It drives me crazy when the internet is slow."], ["Tôi là kiểu người thích lên kế hoạch trước.", "I’m the kind of person who likes to plan ahead."], ["Tôi khá hợp với đồng nghiệp mới.", "I get along well with my new colleague."], ["Tôi thấy nhẹ nhõm khi mọi chuyện xong xuôi.", "I felt relieved when everything was done."]],
  [["Dạo này tôi thấy hơi mệt.", "I’ve been feeling a bit tired lately."], ["Tôi cần vận động nhiều hơn.", "I need to get more exercise."], ["Tôi đang cố giảm đồ ngọt.", "I’m trying to cut down on sugar."], ["Tối qua tôi thức khuya.", "I stayed up late last night."], ["Tôi bị đau đầu từ sáng.", "I’ve had a headache since this morning."]],
  [["Cái này hơi đắt.", "It’s a bit pricey."], ["Đắt nhưng đáng tiền.", "It’s expensive, but it’s worth it."], ["Áo này đang giảm giá.", "This shirt is on sale."], ["Tôi không đủ tiền mua cái đó.", "I can’t afford that."], ["Tôi chỉ xem thôi, cảm ơn.", "I’m just looking, thanks."]],
  [["Đi đến ga tàu bằng cách nào?", "How do I get to the train station?"], ["Xin lỗi, tôi bị kẹt xe.", "Sorry, I got stuck in traffic."], ["Tôi muốn đặt một phòng cho hai đêm.", "I’d like to book a room for two nights."], ["Khách sạn ở gần, đi bộ được.", "The hotel is within walking distance."], ["Chuyến bay của tôi bị hoãn.", "My flight was delayed."]],
  [["Tôi lướt điện thoại cả tối.", "I spent the whole evening scrolling through my phone."], ["Mình giữ liên lạc nhé.", "Let’s keep in touch."], ["Tôi dành quá nhiều thời gian trên TikTok.", "I spend too much time on TikTok."], ["Ứng dụng này cứ bị văng ra.", "This app keeps crashing."], ["Bạn đã cập nhật bản mới chưa?", "Have you updated to the new version?"]],
  [["Anh có thể nói rõ hơn phần này không?", "Could you clarify this part?"], ["Để tôi kiểm tra rồi báo lại anh.", "Let me check and get back to you."], ["Hay là mình thử làm thế này?", "What if we try it this way?"], ["Chúng ta sẽ giải quyết chuyện này.", "We’ll sort it out."], ["Tôi xin phép nói thêm một ý.", "Can I add something?"]],
  [["Tôi hiểu ý bạn, nhưng…", "I see your point, but…"], ["Còn tuỳ vào ngân sách.", "It depends on the budget."], ["Mặt khác, nó tốn nhiều thời gian.", "On the other hand, it takes a lot of time."], ["Tôi không chắc là mình đồng ý.", "I’m not sure I agree."], ["Theo tôi thì…", "In my opinion, …"]],
  [["Tôi định học thêm một khoá nữa.", "I’m planning to take another course."], ["Mục tiêu của tôi là nói tự tin trong cuộc họp.", "My goal is to speak confidently in meetings."], ["Về lâu dài, việc này sẽ đáng công.", "In the long run, it will pay off."], ["Tôi rất mong đến chuyến đi.", "I’m looking forward to the trip."], ["Năm sau tôi muốn chuyển việc.", "Next year I want to change jobs."]],
];

export const TOPICS = [
  "Món ăn bạn thích nhất", "Một ngày làm việc điển hình của bạn", "Ứng dụng bạn dùng nhiều nhất", "Một chuyến đi đáng nhớ",
  "Điều bạn muốn thay đổi ở thành phố mình", "Làm ở nhà hay ở văn phòng tốt hơn", "Một người bạn ngưỡng mộ", "Một thói quen tốt bạn đang có",
  "Một lần mắc lỗi và điều bạn học được", "Mạng xã hội: lợi hay hại", "Kỹ năng bạn muốn học năm nay", "Cuối tuần lý tưởng của bạn",
  "Bộ phim hoặc series bạn vừa xem", "Du lịch một mình hay đi theo nhóm", "Một người sếp tốt cần có gì", "Kế hoạch của bạn cho năm tới",
];

export function quickQaPrompt(topicEn: string): string {
  return `Ask me short, casual questions about ${topicEn}, one at a time. Don’t correct me during the conversation. At the end, list my 3 most important mistakes and better ways to say them.`;
}

export function rolePlayPrompt(topicEn: string): string {
  return `Let’s role-play a real-life situation about ${topicEn}. You play the other person. Ask one question at a time and react naturally to my answers. Only when I say “stop”, tell me my 3 biggest mistakes and better ways to say them.`;
}
