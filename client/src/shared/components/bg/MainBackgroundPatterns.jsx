const MainBackgroundPatterns = () => (
  <>
    {/* Grid */}
    <div className="fixed inset-0 z-0 h-full w-full bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]" />

    {/* Blue Circle */}
    <div className="fixed left-0 right-0 top-[-10%] z-0 m-auto h-[300px] w-[300px] rounded-full bg-blue-500 opacity-20 blur-[100px]" />

    {/* blue Circle */}
    <div className="fixed bottom-[-10%] left-[-10%] z-0 h-[300px] w-[300px] rounded-full bg-blue-500 opacity-20 blur-[100px]" />

    {/* Purple Circle */}
    <div className="fixed top-[20%] right-[-5%] z-0 h-[250px] w-[250px] rounded-full bg-purple-500 opacity-20 blur-[100px]" />
  </>
);

export default MainBackgroundPatterns;
