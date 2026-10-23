import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-10 bg-navy text-[#d0deef]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <div className="bn text-xl font-bold text-white">
            শিক্ষক<span className="text-sun">AI</span>
          </div>
          <p className="bn mt-2 text-sm">তোমার কোর্স, তোমার ভাষায়। Gemma 3 দিয়ে চলা ব্যক্তিগত শিক্ষক।</p>
        </div>
        <div className="bn space-y-1 text-sm">
          <div className="mb-2 font-semibold text-white">শুরু করো</div>
          <Link href="/library" className="block hover:text-white">লেকচার আপলোড</Link>
          <Link href="/classroom" className="block hover:text-white">নতুন লেসন</Link>
          <Link href="/progress" className="block hover:text-white">অগ্রগতি ও রিভিশন</Link>
        </div>
        <div className="bn text-sm">
          <div className="mb-2 font-semibold text-white">গোপনীয়তা</div>
          <p>তোমার ডকুমেন্ট ও শেখার ইতিহাস তোমার কম্পিউটারেই থাকে। অগ্রগতি পেজ থেকে এক্সপোর্ট বা মুছে ফেলতে পারো।</p>
        </div>
      </div>
    </footer>
  );
}
