/** All actors share the same camera distance and physical foot baseline. */
export function actorLayout(width:number,height:number) {
  const mobile=width<=600;
  return {height:mobile?Math.min(height*0.44,360):Math.min(Math.max(height*0.59,304),608),bottom:mobile?92:90};
}
