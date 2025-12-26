'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Trash2, Send } from 'lucide-react';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc, increment, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export default function ShoutItem({ shout, user, handleUserClick }) {
    const [comments, setComments] = useState([]);
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sending, setSending] = useState(false);
    const [deletingId, setDeletingId] = useState(null); // 'shout' or commentId

    const isLiked = shout.likes?.includes(user?.uid);
    const isMine = shout.userId === user?.uid;

    // Listen to inline comments
    useEffect(() => {
        if (!showComments) return;

        const q = query(
            collection(db, "shouts", shout.id, "comments"),
            orderBy("createdAt", "asc")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setComments(data);
        });

        return () => unsub();
    }, [showComments, shout.id]);

    const handleLike = async () => {
        if (!user) return;
        const shoutRef = doc(db, "shouts", shout.id);
        if (isLiked) {
            await updateDoc(shoutRef, { likes: arrayRemove(user.uid) });
        } else {
            await updateDoc(shoutRef, { likes: arrayUnion(user.uid) });
        }
    };

    const handlePostComment = async () => {
        if (!commentText.trim()) return;
        setSending(true);

        try {
            // 1. Add Comment
            await addDoc(collection(db, "shouts", shout.id, "comments"), {
                text: commentText.trim(),
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userPhoto: user.photoURL,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });

            // 2. Increment Count
            const shoutRef = doc(db, "shouts", shout.id);
            updateDoc(shoutRef, {
                commentCount: increment(1)
            }).catch(e => console.error("Inc failed", e));

            setCommentText('');
        } catch (e) {
            console.error(e);
            alert("Failed to comment");
        } finally {
            setSending(false);
        }
    };

    const handleDeleteShout = async () => {
        if (!isMine) return;
        if (deletingId === 'shout') {
            await deleteDoc(doc(db, "shouts", shout.id));
        } else {
            setDeletingId('shout');
            setTimeout(() => setDeletingId(null), 3000);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (deletingId === commentId) {
            await deleteDoc(doc(db, "shouts", shout.id, "comments", commentId));

            // Decrement Count
            const shoutRef = doc(db, "shouts", shout.id);
            updateDoc(shoutRef, {
                commentCount: increment(-1)
            }).catch(e => console.error("Dec failed", e));

            setDeletingId(null);
        } else {
            setDeletingId(commentId);
            setTimeout(() => setDeletingId(null), 3000);
        }
    };

    return (
        <div className="group relative bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">


            <div className="relative z-10 flex items-start gap-4">
                <div className="relative">
                    <div
                        onClick={() => handleUserClick(shout.userId, shout.userName, shout.userPhoto)}
                        className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden shrink-0 border border-white/10 cursor-pointer shadow-lg"
                    >
                        {(shout.userId === user?.uid ? user?.photoURL : shout.userPhoto) ? (
                            <img src={(shout.userId === user?.uid ? user.photoURL : shout.userPhoto)} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold text-sm">
                                {(shout.userId === user?.uid ? user?.displayName : shout.userName)?.[0]?.toUpperCase()}
                            </div>
                        )}
                    </div>
                    {shout.emojiStyle && (
                        <div className={`absolute z-20 select-none pointer-events-none drop-shadow-sm ${Array.from(shout.emojiStyle).length > 2
                            ? '-bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm text-black px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border border-white/20 leading-tight shadow-sm whitespace-normal text-center w-max max-w-[70px] flex items-center justify-center'
                            : '-bottom-1 -right-1 text-base'}`}>
                            {shout.emojiStyle}
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                        <span
                            onClick={() => handleUserClick(shout.userId, shout.userName, shout.userPhoto)}
                            className="font-bold text-white text-sm cursor-pointer hover:text-purple-400 transition-colors"
                        >
                            {shout.userId === user?.uid ? (user?.displayName || 'Anonymous') : shout.userName}
                        </span>

                        {isMine && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteShout(); }}
                                className={`transition-all ${deletingId === 'shout' ? 'text-red-500 font-bold text-xs animate-pulse' : 'text-gray-500 hover:text-red-500'}`}
                            >
                                {deletingId === 'shout' ? 'Confirm?' : <Trash2 className="w-4 h-4" />}
                            </button>
                        )}
                    </div>

                    <p className="text-gray-200 text-sm leading-relaxed break-words">{shout.text}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleLike(); }}
                            className={`flex items-center gap-1.5 text-xs font-medium transition-colors group/btn ${isLiked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-400'}`}
                        >
                            <div className={`p-1.5 rounded-full transition-colors ${isLiked ? 'bg-pink-500/20' : 'bg-white/5 group-hover/btn:bg-pink-500/20'}`}>
                                <Heart className="w-3.5 h-3.5" fill={isLiked ? "currentColor" : "none"} />
                            </div>
                            {shout.likes?.length || 0}
                        </button>

                        <button
                            onClick={() => setShowComments(!showComments)}
                            className={`flex items-center gap-1.5 text-xs font-medium transition-colors group/btn ${showComments ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                        >
                            <div className={`p-1.5 rounded-full transition-colors ${showComments ? 'bg-blue-500/20' : 'bg-white/5 group-hover/btn:bg-blue-500/20'}`}>
                                <MessageCircle className="w-3.5 h-3.5" />
                            </div>
                            {shout.commentCount || (comments.length > 0 ? comments.length : 0)}
                        </button>
                    </div>

                    {/* Inline Comments Section */}
                    {showComments && (
                        <div className="mt-4 space-y-3 pl-3 border-l-2 border-white/10">
                            {comments.length === 0 && (
                                <div className="py-2 flex items-center gap-2 opacity-50">
                                    <div className="h-px bg-white/20 flex-1" />
                                    <span className="text-[10px] text-gray-400 uppercase tracking-widest">No replies yet</span>
                                    <div className="h-px bg-white/20 flex-1" />
                                </div>
                            )}

                            {comments.map(comment => (
                                <div key={comment.id} className="text-sm flex gap-3 items-start animate-in fade-in slide-in-from-bottom-1">
                                    <div className="w-6 h-6 rounded-full bg-gray-700 overflow-hidden shrink-0 border border-white/10 mt-1">
                                        {comment.userPhoto ? (
                                            <img src={comment.userPhoto} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full w-full text-[10px] font-bold text-white bg-gray-600">
                                                {comment.userName?.[0]?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="bg-white/5 rounded-2xl rounded-tl-none p-3 border border-white/5">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="font-bold text-purple-200 text-xs">{comment.userName}</span>
                                                {(comment.userId === user?.uid) && (
                                                    <button
                                                        onClick={() => handleDeleteComment(comment.id)}
                                                        className={`transition-colors ${deletingId === comment.id ? 'text-red-500 font-bold text-[10px]' : 'text-gray-500 hover:text-red-500'}`}
                                                    >
                                                        {deletingId === comment.id ? 'Delete?' : <Trash2 className="w-3 h-3" />}
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-gray-200 break-words leading-relaxed text-sm">{comment.text}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Comment Input */}
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Write a reply..."
                                    maxLength={200}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-20 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
                                    onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <span className={`text-[10px] ${commentText.length >= 200 ? 'text-red-400 font-bold' : 'text-gray-600'}`}>
                                        {commentText.length}/200
                                    </span>
                                    <button
                                        onClick={handlePostComment}
                                        disabled={!commentText.trim() || sending}
                                        className="p-1.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {sending ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
