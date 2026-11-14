const { connectClient } = require('./db');

(async () => {
  const client = await connectClient();
  try {
    // Find admin attendance records
    const adminRecords = await client.query(`
      SELECT a.id, a.user_id, a.name, a.date, a.check_in, a.check_out, u.username
      FROM public.attendance a
      JOIN public.users u ON u.id = a.user_id
      WHERE u.role = 'admin'
      ORDER BY a.date DESC, a.check_in DESC
    `);
    
    if (adminRecords.rows.length === 0) {
      console.log('✓ Tidak ada catatan absensi admin yang perlu dihapus.');
    } else {
      console.log('Ditemukan ' + adminRecords.rows.length + ' catatan absensi admin:');
      adminRecords.rows.forEach(r => {
        console.log('  - ' + r.name + ' (' + r.username + ') - ' + r.date + ' ' + (r.check_in || '-') + ' s/d ' + (r.check_out || '-'));
      });
      
      // Delete admin attendance records
      const deleteResult = await client.query(`
        DELETE FROM public.attendance
        WHERE user_id IN (SELECT id FROM public.users WHERE role = 'admin')
      `);
      
      console.log('\n✓ Berhasil menghapus ' + deleteResult.rowCount + ' catatan absensi admin.');
    }
    
    // Verify no more admin attendance
    const verify = await client.query(`
      SELECT COUNT(*) as count FROM public.attendance a
      JOIN public.users u ON u.id = a.user_id
      WHERE u.role = 'admin'
    `);
    console.log('\nVerifikasi: ' + verify.rows[0].count + ' catatan absensi admin tersisa.');
    
    // Also verify all attendance is from interns
    const internCount = await client.query(`
      SELECT COUNT(*) as count FROM public.attendance a
      JOIN public.users u ON u.id = a.user_id
      WHERE u.role = 'intern'
    `);
    console.log('Total catatan absensi peserta (intern): ' + internCount.rows[0].count);
    
    const adminUserCount = await client.query(`
      SELECT COUNT(*) as count FROM public.users WHERE role = 'admin'
    `);
    console.log('Total akun admin: ' + adminUserCount.rows[0].count);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  await client.end();
})();
